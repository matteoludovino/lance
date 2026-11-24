import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Page, ProjectDetail, ProjectInput, ProjectSummary } from "@lance/shared";
import type { z } from "zod";
import type { projectFilters } from "@lance/shared";
import type { AuthUser } from "../auth/auth-user.ts";
import { uuidv7 } from "../common/ids.ts";
import { expectChanged, transaction } from "../common/transactions.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { OutboxService, type Tx } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { visibleTo } from "../sandbox/scope.ts";
import { Clock } from "../time/clock.ts";
import { MARKET_EVENTS } from "./marketplace-emails.ts";
import { projectDetail, projectInclude, projectSummary, proposalInclude, proposalView } from "./views.ts";

type Parsed<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };
const PAGE_SIZE = 20;

export const NOT_FOUND = { code: "not_found", message: "Projeto não encontrado." };

/** Publishing, editing and closing projects, and reading them as each viewer may. */
@Injectable()
export class Projects {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
  ) {}

  async create(user: AuthUser, input: Parsed<ProjectInput> & { publish: boolean }): Promise<ProjectDetail> {
    const profile = await this.db.clientProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      throw new ForbiddenException({
        code: "needs_client_profile",
        message: "Crie seu perfil de cliente antes de publicar um projeto.",
      });
    }
    const now = this.clock.now();
    const { publish, ...fields } = input;
    const id = uuidv7(now.getTime());
    await this.db.project.create({
      data: {
        id,
        clientId: user.id,
        sandboxId: user.sandboxId,
        ...this.columns(fields),
        status: publish ? "open" : "draft",
        publishedAt: publish ? now : null,
        createdAt: now,
      },
    });
    return this.detail(user, id);
  }

  /** The owner edits a draft or an open project (proposals already sent keep what they answered). */
  async update(user: AuthUser, id: string, input: Parsed<ProjectInput>): Promise<ProjectDetail> {
    await this.owned(user, id);
    const { count } = await this.db.project.updateMany({
      where: { id, status: { in: ["draft", "open"] } },
      data: this.columns(input),
    });
    expectChanged(count, { code: "not_editable", message: "Este projeto não pode mais ser editado." });
    return this.detail(user, id);
  }

  async publish(user: AuthUser, id: string): Promise<ProjectDetail> {
    await this.owned(user, id);
    const { count } = await this.db.project.updateMany({
      where: { id, status: "draft" },
      data: { status: "open", publishedAt: this.clock.now() },
    });
    expectChanged(count, { code: "not_draft", message: "Este projeto já foi publicado ou encerrado." });
    return this.detail(user, id);
  }

  /** Closing without hiring: every proposal still in the running is declined (and told so). */
  async close(user: AuthUser, id: string): Promise<ProjectDetail> {
    await this.owned(user, id);
    await transaction(this.db, async (tx) => {
      const now = this.clock.now();
      const { count } = await tx.project.updateMany({
        where: { id, status: { in: ["draft", "open"] } },
        data: { status: "cancelled", closedAt: now },
      });
      expectChanged(count, {
        code: "not_closable",
        message: "Este projeto já tem contrato ou foi encerrado.",
      });
      await this.declinePending(tx, id, now);
    });
    this.outbox.committed();
    return this.detail(user, id);
  }

  /** Declines the proposals still submitted for a project that is no longer open. */
  async declinePending(tx: Tx, projectId: string, now: Date, except?: string): Promise<void> {
    const pending = await tx.proposal.findMany({
      where: { projectId, status: "submitted", ...(except ? { id: { not: except } } : {}) },
      select: { id: true, sandboxId: true },
    });
    if (pending.length === 0) return;
    await tx.proposal.updateMany({
      where: { id: { in: pending.map((p) => p.id) }, status: "submitted" },
      data: { status: "declined", decidedAt: now },
    });
    for (const proposal of pending) {
      await this.outbox.add(
        tx,
        MARKET_EVENTS.proposalDeclined,
        { proposalId: proposal.id },
        {
          sandboxId: proposal.sandboxId,
        },
      );
    }
  }

  /** Open projects, newest first, as the viewer's view of the marketplace has them. */
  async list(
    viewer: AuthUser | null,
    filters: z.infer<typeof projectFilters>,
  ): Promise<Page<ProjectSummary>> {
    const after = decodeCursor(filters.cursor);
    const rows = await this.db.project.findMany({
      where: {
        AND: [
          { status: "open", hiddenAt: null, client: { suspendedAt: null } },
          visibleTo(viewer),
          filters.category ? { category: filters.category } : {},
          filters.skill ? { skills: { has: filters.skill } } : {},
          after
            ? {
                OR: [
                  { publishedAt: { lt: after.publishedAt } },
                  { publishedAt: after.publishedAt, id: { lt: after.id } },
                ],
              }
            : {},
        ],
      },
      include: projectInclude,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });
    const page = rows.slice(0, PAGE_SIZE);
    const counts = await this.pendingCounts(
      viewer,
      page.map((p) => p.id),
    );
    const last = page.at(-1);
    return {
      items: page.map((project) => projectSummary(project, counts.get(project.id) ?? 0)),
      next: rows.length > PAGE_SIZE && last ? encodeCursor(last.publishedAt!, last.id) : null,
    };
  }

  /** The owner's projects, every state, newest first. */
  async mine(user: AuthUser): Promise<ProjectSummary[]> {
    const rows = await this.db.project.findMany({
      where: { clientId: user.id },
      include: projectInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const counts = await this.pendingCounts(
      user,
      rows.map((p) => p.id),
    );
    return rows.map((project) => projectSummary(project, counts.get(project.id) ?? 0));
  }

  /** One project: drafts only for their owner; the viewer's own proposal comes along. */
  async detail(viewer: AuthUser | null, id: string): Promise<ProjectDetail> {
    const project = await this.db.project.findFirst({
      where: { id, ...this.visible(viewer) },
      include: { ...projectInclude, contract: { select: { id: true } } },
    });
    if (!project) throw new NotFoundException(NOT_FOUND);
    const isOwner = viewer?.id === project.clientId;
    const mine = viewer
      ? await this.db.proposal.findUnique({
          where: { projectId_freelancerId: { projectId: id, freelancerId: viewer.id } },
          include: proposalInclude,
        })
      : null;
    const counts = await this.pendingCounts(viewer, [id]);
    return projectDetail(project, {
      proposalCount: counts.get(id) ?? 0,
      myProposal: mine ? proposalView(mine) : null,
      isOwner,
    });
  }

  /** Throws unless the viewer owns the project (404 for anyone who can't see it, 403 for the rest). */
  async owned(user: AuthUser, id: string) {
    const project = await this.db.project.findFirst({ where: { id, ...this.visible(user) } });
    if (!project) throw new NotFoundException(NOT_FOUND);
    if (project.clientId !== user.id) {
      throw new ForbiddenException({
        code: "not_owner",
        message: "Só quem publicou o projeto pode fazer isto.",
      });
    }
    return project;
  }

  /** Who may see a project: its owner always; others, if it's published, up, and in their marketplace. */
  visible(viewer: AuthUser | null): Prisma.ProjectWhereInput {
    const others: Prisma.ProjectWhereInput = {
      AND: [visibleTo(viewer), { status: { not: "draft" }, hiddenAt: null, client: { suspendedAt: null } }],
    };
    return viewer ? { OR: [{ clientId: viewer.id }, others] } : others;
  }

  /** Proposals still in the running per project, counting only those the viewer's marketplace has. */
  private async pendingCounts(viewer: AuthUser | null, ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.db.proposal.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids }, status: "submitted", ...visibleTo(viewer) },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.projectId, group._count._all]));
  }

  private columns(input: Parsed<ProjectInput>) {
    return {
      title: input.title,
      description: input.description,
      category: input.category,
      skills: input.skills,
      budgetMinCents: BigInt(input.budgetMinCents),
      budgetMaxCents: BigInt(input.budgetMaxCents),
    };
  }
}

function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(`${publishedAt.toISOString()}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string | undefined): { publishedAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
  const publishedAt = new Date(iso ?? "");
  if (Number.isNaN(publishedAt.getTime()) || !id || !/^[0-9a-f-]{36}$/.test(id)) return null;
  return { publishedAt, id };
}

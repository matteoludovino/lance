import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { proposalPrice, type MyProposal, type ProposalInput, type ProposalView } from "@lance/shared";
import type { AuthUser } from "../auth/auth-user.ts";
import { uuidv7 } from "../common/ids.ts";
import { expectChanged, isUniqueViolation, transaction } from "../common/transactions.ts";
import { ENV, type Env } from "../env.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { visibleTo } from "../sandbox/scope.ts";
import { Clock } from "../time/clock.ts";
import { MARKET_EVENTS } from "./marketplace-emails.ts";
import { NOT_FOUND, Projects } from "./projects.service.ts";
import { myProposal, proposalInclude, proposalView } from "./views.ts";

type Parsed<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

const PROPOSAL_NOT_FOUND = { code: "not_found", message: "Proposta não encontrada." };
const NOT_OPEN = { code: "project_not_open", message: "Este projeto não está mais recebendo propostas." };

/**
 * Proposals: send (one per freelancer and project), edit, withdraw and send again, decline, accept.
 * Every state change is a conditional update; accepting is one transaction that locks the project.
 */
@Injectable()
export class Proposals {
  constructor(
    private readonly db: PrismaService,
    private readonly projects: Projects,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Sends a proposal, or sends again one that was withdrawn (same row, next version). */
  async submit(user: AuthUser, projectId: string, input: Parsed<ProposalInput>): Promise<ProposalView> {
    const freelancer = await this.db.freelancerProfile.findUnique({ where: { userId: user.id } });
    if (!freelancer) {
      throw new ForbiddenException({
        code: "needs_freelancer_profile",
        message: "Crie seu perfil de freelancer antes de enviar propostas.",
      });
    }
    const project = await this.db.project.findFirst({
      where: { id: projectId, ...this.projects.visible(user) },
    });
    if (!project) throw new NotFoundException(NOT_FOUND);
    if (project.clientId === user.id) {
      throw new ForbiddenException({
        code: "own_project",
        message: "Você não pode propor no seu próprio projeto.",
      });
    }
    if (project.status !== "open") throw new ConflictException(NOT_OPEN);

    const fields = this.columns(input);
    let id: string;
    try {
      id = await transaction(this.db, async (tx) => {
        const now = this.clock.now();
        const existing = await tx.proposal.findUnique({
          where: { projectId_freelancerId: { projectId, freelancerId: user.id } },
        });
        let proposalId: string;
        if (existing) {
          const { count } = await tx.proposal.updateMany({
            where: { id: existing.id, status: "withdrawn" },
            data: {
              ...fields,
              status: "submitted",
              version: { increment: 1 },
              submittedAt: now,
              decidedAt: null,
            },
          });
          expectChanged(count, {
            code: "already_proposed",
            message: "Você já tem uma proposta neste projeto.",
          });
          proposalId = existing.id;
        } else {
          proposalId = uuidv7(now.getTime());
          await tx.proposal.create({
            data: {
              id: proposalId,
              projectId,
              freelancerId: user.id,
              sandboxId: user.sandboxId,
              ...fields,
              submittedAt: now,
              createdAt: now,
            },
          });
          // The conversation between the two starts with the proposal.
          await tx.conversation.upsert({
            where: { projectId_freelancerId: { projectId, freelancerId: user.id } },
            create: {
              id: uuidv7(now.getTime()),
              projectId,
              clientId: project.clientId,
              freelancerId: user.id,
              sandboxId: user.sandboxId ?? project.sandboxId,
              createdAt: now,
            },
            update: {},
          });
        }
        // Still open now, inside the transaction (it may have closed since the check above).
        const stillOpen = await tx.project.count({ where: { id: projectId, status: "open" } });
        if (stillOpen === 0) throw new ConflictException(NOT_OPEN);
        await this.outbox.add(
          tx,
          MARKET_EVENTS.proposalSubmitted,
          { proposalId },
          { sandboxId: user.sandboxId },
        );
        return proposalId;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: "already_proposed",
          message: "Você já tem uma proposta neste projeto.",
        });
      }
      throw error;
    }
    this.outbox.committed();
    return this.view(id);
  }

  /** The author changes a proposal still in the running; the version moves on. */
  async update(user: AuthUser, id: string, input: Parsed<ProposalInput>): Promise<ProposalView> {
    const proposal = await this.authored(user, id);
    const { count } = await this.db.proposal.updateMany({
      where: { id, status: "submitted", project: { status: "open" } },
      data: { ...this.columns(input), version: { increment: 1 } },
    });
    expectChanged(count, { code: "not_editable", message: "Esta proposta não pode mais ser alterada." });
    return this.view(proposal.id);
  }

  async withdraw(user: AuthUser, id: string): Promise<ProposalView> {
    await this.authored(user, id);
    const { count } = await this.db.proposal.updateMany({
      where: { id, status: "submitted" },
      data: { status: "withdrawn", decidedAt: this.clock.now() },
    });
    expectChanged(count, { code: "not_withdrawable", message: "Esta proposta já foi decidida." });
    return this.view(id);
  }

  async decline(user: AuthUser, id: string): Promise<ProposalView> {
    const proposal = await this.forOwner(user, id);
    await transaction(this.db, async (tx) => {
      const { count } = await tx.proposal.updateMany({
        where: { id, status: "submitted" },
        data: { status: "declined", decidedAt: this.clock.now() },
      });
      expectChanged(count, { code: "not_pending", message: "Esta proposta já foi decidida ou retirada." });
      await this.outbox.add(
        tx,
        MARKET_EVENTS.proposalDeclined,
        { proposalId: id },
        {
          sandboxId: proposal.sandboxId,
        },
      );
    });
    this.outbox.committed();
    return this.view(id);
  }

  /**
   * Hires: in one transaction, lock the project, move it open → in_progress, the proposal (at the
   * version the client saw) submitted → accepted, decline the rest, and create the contract with the
   * proposal's milestones and the current fee. A second acceptance finds the project no longer open.
   */
  async accept(user: AuthUser, id: string, version: number): Promise<{ contractId: string }> {
    const proposal = await this.forOwner(user, id);
    let contractId: string;
    try {
      contractId = await transaction(this.db, async (tx) => {
        const now = this.clock.now();
        await tx.$queryRaw`SELECT id FROM projects WHERE id = ${proposal.projectId}::uuid FOR UPDATE`;
        const opened = await tx.project.updateMany({
          where: { id: proposal.projectId, status: "open" },
          data: { status: "in_progress", closedAt: now },
        });
        expectChanged(opened.count, NOT_OPEN);
        const accepted = await tx.proposal.updateMany({
          where: { id, status: "submitted", version },
          data: { status: "accepted", decidedAt: now },
        });
        if (accepted.count === 0) {
          const current = await tx.proposal.findUniqueOrThrow({ where: { id } });
          throw new ConflictException(
            current.status === "submitted"
              ? {
                  code: "proposal_changed",
                  message: "A proposta mudou desde que você a abriu. Confira a nova versão antes de aceitar.",
                }
              : { code: "not_pending", message: "Esta proposta foi retirada ou já foi decidida." },
          );
        }
        await this.projects.declinePending(tx, proposal.projectId, now, id);

        const row = await tx.proposal.findUniqueOrThrow({ where: { id } });
        const milestones = row.milestones as { title: string; amountCents: number }[];
        const contract = uuidv7(now.getTime());
        await tx.contract.create({
          data: {
            id: contract,
            projectId: row.projectId,
            proposalId: id,
            clientId: user.id,
            freelancerId: row.freelancerId,
            sandboxId: user.sandboxId ?? row.sandboxId,
            priceCents: row.priceCents,
            feeBps: this.env.PLATFORM_FEE_BPS,
            autoReleaseHours: this.env.AUTO_RELEASE_HOURS,
            createdAt: now,
            milestones: {
              create: milestones.map((milestone, index) => ({
                id: uuidv7(now.getTime()),
                position: index + 1,
                title: milestone.title,
                amountCents: BigInt(milestone.amountCents),
                createdAt: now,
              })),
            },
          },
        });
        await this.outbox.add(
          tx,
          MARKET_EVENTS.proposalAccepted,
          { proposalId: id },
          { sandboxId: row.sandboxId },
        );
        return contract;
      });
    } catch (error) {
      // The last line of defence: one contract per project, one per proposal.
      if (isUniqueViolation(error)) throw new ConflictException(NOT_OPEN);
      throw error;
    }
    this.outbox.committed();
    return { contractId };
  }

  /** The project's proposals, for its owner (withdrawn ones are gone from the list). */
  async forProject(user: AuthUser, projectId: string): Promise<ProposalView[]> {
    await this.projects.owned(user, projectId);
    const rows = await this.db.proposal.findMany({
      where: {
        projectId,
        status: { not: "withdrawn" },
        ...visibleTo(user),
        freelancer: { suspendedAt: null },
      },
      include: proposalInclude,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    });
    return rows.map(proposalView);
  }

  /** The freelancer's proposals, newest first. */
  async mine(user: AuthUser): Promise<MyProposal[]> {
    const rows = await this.db.proposal.findMany({
      where: { freelancerId: user.id },
      include: { ...proposalInclude, project: { select: { id: true, title: true, status: true } } },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(myProposal);
  }

  private async authored(user: AuthUser, id: string) {
    const proposal = await this.db.proposal.findFirst({ where: { id, freelancerId: user.id } });
    if (!proposal) throw new NotFoundException(PROPOSAL_NOT_FOUND);
    return proposal;
  }

  /** A proposal on one of the viewer's projects, from their view of the marketplace. */
  private async forOwner(user: AuthUser, id: string) {
    const proposal = await this.db.proposal.findFirst({
      where: { id, project: { clientId: user.id }, ...visibleTo(user) },
    });
    if (!proposal) throw new NotFoundException(PROPOSAL_NOT_FOUND);
    return proposal;
  }

  private async view(id: string): Promise<ProposalView> {
    return proposalView(
      await this.db.proposal.findUniqueOrThrow({ where: { id }, include: proposalInclude }),
    );
  }

  private columns(input: Parsed<ProposalInput>) {
    return {
      coverLetter: input.coverLetter,
      deliveryDays: input.deliveryDays,
      milestones: input.milestones,
      priceCents: BigInt(proposalPrice(input.milestones)),
    };
  }
}

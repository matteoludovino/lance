import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ModerationAction,
  ReportDetail,
  ReportInput,
  ReportReason,
  ReportTarget,
  ReportView,
} from "@lance/shared";
import type { AuthUser } from "../auth/auth-user.ts";
import { uuidv7 } from "../common/ids.ts";
import { RateLimiter } from "../common/rate-limiter.ts";
import { expectChanged, isUniqueViolation, transaction } from "../common/transactions.ts";
import type { Report } from "../generated/prisma/client.ts";
import { OutboxService, type Tx } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Hub } from "../realtime/hub.ts";
import { revealedAbout } from "../reviews/reputation.ts";
import { visibleTo } from "../sandbox/scope.ts";
import { Clock } from "../time/clock.ts";
import { Audit } from "./audit.ts";

type Parsed<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

/** A notice to the person whose content was hidden or account suspended. */
export const MODERATION_NOTICE = "moderation.notice";
export interface ModerationNotice {
  userId: string;
  resolution: "hidden" | "suspended";
  targetType: ReportTarget;
  label: string;
  reason: ReportReason;
}

const REPORTS_PER_HOUR = { max: 20, windowMs: 3_600_000 };
const NOT_FOUND = { code: "not_found", message: "Não encontramos o que você quer denunciar." };
const REPORT_NOT_FOUND = { code: "not_found", message: "Denúncia não encontrada." };

/** What a report points at, as moderation needs it. */
interface Target {
  /** The person who wrote or owns it. */
  userId: string;
  /** The corner of the marketplace it belongs to: admins act only on their own. */
  sandboxId: string | null;
  label: string;
  url: string | null;
  hidden: boolean;
  content: string | null;
  contactFlags: string[];
}

/**
 * Reports and what moderation does with them. People report what they can see (never their own
 * things); the system reports messages with contact details before a contract. Admins see their own
 * corner's queue, hide the content or suspend its author (and can undo either), or dismiss the report;
 * every one of those, and every report an admin opens, lands in the audit log in the same transaction.
 */
@Injectable()
export class Reports {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly audit: Audit,
    private readonly outbox: OutboxService,
    private readonly limiter: RateLimiter,
    private readonly hub: Hub,
  ) {}

  async create(user: AuthUser, input: Parsed<ReportInput>): Promise<{ id: string }> {
    this.limiter.hit(`report:user:${user.id}`, REPORTS_PER_HOUR);
    const owner = await this.reportable(user, input.targetType, input.targetId);
    if (!owner) throw new NotFoundException(NOT_FOUND);
    if (owner === user.id) {
      throw new ForbiddenException({ code: "own_content", message: "Você não pode denunciar algo seu." });
    }
    const now = this.clock.now();
    const id = uuidv7(now.getTime());
    try {
      await this.db.report.create({
        data: {
          id,
          reporterId: user.id,
          targetType: input.targetType,
          targetId: input.targetId,
          targetUserId: owner,
          reason: input.reason,
          details: input.details,
          sandboxId: user.sandboxId,
          createdAt: now,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      throw new ConflictException({
        code: "already_reported",
        message: "Você já denunciou isto. A moderação vai analisar.",
      });
    }
    return { id };
  }

  /** The admin's queue: open reports oldest first, or the latest closed ones. */
  async list(admin: AuthUser, status: "open" | "closed"): Promise<ReportView[]> {
    const reports = await this.db.report.findMany({
      where: {
        sandboxId: admin.sandboxId,
        status: status === "open" ? "open" : { in: ["actioned", "dismissed"] },
      },
      orderBy:
        status === "open" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ resolvedAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return Promise.all(reports.map(async (report) => (await this.view(report)).view));
  }

  /** One report with the reported content itself. Opening it is audited (messages are private). */
  async detail(admin: AuthUser, id: string): Promise<ReportDetail> {
    return transaction(this.db, async (tx) => {
      const report = await tx.report.findFirst({ where: { id, sandboxId: admin.sandboxId } });
      if (!report) throw new NotFoundException(REPORT_NOT_FOUND);
      const { view, target } = await this.view(report, tx);
      await this.audit.record(
        tx,
        admin,
        "report.viewed",
        { type: report.targetType, id: report.targetId },
        {
          reportId: id,
        },
      );
      return { ...view, content: target?.content ?? null, contactFlags: target?.contactFlags ?? [] };
    });
  }

  /**
   * Hide the content, suspend its author, or dismiss the report. Hiding or suspending closes every open
   * report about the same thing; dismissing closes this one.
   */
  async resolve(
    admin: AuthUser,
    id: string,
    action: ModerationAction,
    note: string | null,
  ): Promise<ReportView> {
    let suspended: string | null = null;
    await transaction(this.db, async (tx) => {
      const report = await tx.report.findFirst({ where: { id, sandboxId: admin.sandboxId } });
      if (!report) throw new NotFoundException(REPORT_NOT_FOUND);
      const now = this.clock.now();
      const resolution = action === "hide" ? "hidden" : action === "suspend" ? "suspended" : "dismissed";
      const { count } = await tx.report.updateMany({
        where:
          action === "dismiss"
            ? { id, status: "open" }
            : {
                targetType: report.targetType,
                targetId: report.targetId,
                sandboxId: report.sandboxId,
                status: "open",
              },
        data: {
          status: action === "dismiss" ? "dismissed" : "actioned",
          resolution,
          resolvedAt: now,
          resolvedById: admin.id,
          note,
        },
      });
      expectChanged(count, { code: "already_resolved", message: "Esta denúncia já foi resolvida." });
      const target = await this.target(tx, report.targetType, report.targetId);
      if (action !== "dismiss") {
        if (!target) throw new NotFoundException(NOT_FOUND);
        this.sameCorner(admin, target);
        if (action === "hide") await this.setHidden(tx, report.targetType, report.targetId, now);
        else {
          await tx.user.update({ where: { id: report.targetUserId }, data: { suspendedAt: now } });
          await tx.session.deleteMany({ where: { userId: report.targetUserId } });
          suspended = report.targetUserId;
        }
        const notice: ModerationNotice = {
          userId: report.targetUserId,
          resolution: resolution as "hidden" | "suspended",
          targetType: report.targetType,
          label: target.label,
          reason: report.reason,
        };
        await this.outbox.add(tx, MODERATION_NOTICE, { ...notice }, { sandboxId: target.sandboxId });
      }
      await this.audit.record(
        tx,
        admin,
        `report.${resolution}`,
        { type: report.targetType, id: report.targetId },
        {
          reportId: id,
          reason: report.reason,
          closed: count,
          ...(note ? { note } : {}),
        },
      );
    });
    // Signed out everywhere: their live connections end too.
    if (suspended) this.hub.closeUser(suspended);
    this.outbox.committed();
    const report = await this.db.report.findUniqueOrThrow({ where: { id } });
    return (await this.view(report)).view;
  }

  /**
   * Undoes a decision: the content comes back (or the account), and the reports closed with it are open
   * again, to be decided anew.
   */
  async reopen(admin: AuthUser, id: string): Promise<ReportView> {
    await transaction(this.db, async (tx) => {
      const report = await tx.report.findFirst({ where: { id, sandboxId: admin.sandboxId } });
      if (!report) throw new NotFoundException(REPORT_NOT_FOUND);
      if (report.status === "open") {
        throw new ConflictException({ code: "still_open", message: "Esta denúncia ainda está aberta." });
      }
      if (report.resolution !== "dismissed") {
        const target = await this.target(tx, report.targetType, report.targetId);
        if (target) this.sameCorner(admin, target);
        if (report.resolution === "hidden")
          await this.setHidden(tx, report.targetType, report.targetId, null);
        else await tx.user.update({ where: { id: report.targetUserId }, data: { suspendedAt: null } });
      }
      const { count } = await tx.report.updateMany({
        where:
          report.resolution === "dismissed"
            ? { id, status: "dismissed" }
            : {
                targetType: report.targetType,
                targetId: report.targetId,
                sandboxId: report.sandboxId,
                resolution: report.resolution,
                status: "actioned",
              },
        data: { status: "open", resolution: null, resolvedAt: null, resolvedById: null, note: null },
      });
      expectChanged(count, { code: "already_open", message: "Esta decisão já foi desfeita." });
      await this.audit.record(
        tx,
        admin,
        "report.reopened",
        { type: report.targetType, id: report.targetId },
        {
          reportId: id,
          undid: report.resolution,
        },
      );
    });
    const report = await this.db.report.findUniqueOrThrow({ where: { id } });
    return (await this.view(report)).view;
  }

  /** Real admins act on the real marketplace; a demo's admin persona, on its own sandbox only. */
  private sameCorner(admin: AuthUser, target: Target): void {
    if (target.sandboxId !== admin.sandboxId) {
      throw new ForbiddenException({
        code: "outside_sandbox",
        message:
          "Isto pertence à vitrine do Lance: aqui você só modera o que foi criado na sua demonstração.",
      });
    }
  }

  /** Who owns the target, if the reporter can see it; null when they can't (or it doesn't exist). */
  private async reportable(user: AuthUser, type: ReportTarget, id: string): Promise<string | null> {
    switch (type) {
      case "project": {
        const project = await this.db.project.findFirst({
          where: {
            id,
            status: { not: "draft" },
            hiddenAt: null,
            client: { suspendedAt: null },
            ...visibleTo(user),
          },
          select: { clientId: true },
        });
        return project?.clientId ?? null;
      }
      case "profile": {
        const person = await this.db.user.findFirst({
          where: {
            id,
            suspendedAt: null,
            ...visibleTo(user),
            OR: [{ freelancerProfile: { hiddenAt: null } }, { clientProfile: { hiddenAt: null } }],
          },
          select: { id: true },
        });
        return person?.id ?? null;
      }
      case "message": {
        const message = await this.db.message.findFirst({
          where: {
            id,
            hiddenAt: null,
            conversation: { OR: [{ clientId: user.id }, { freelancerId: user.id }] },
          },
          select: { senderId: true },
        });
        return message?.senderId ?? null;
      }
      case "review": {
        const review = await this.db.review.findFirst({ where: { id, hiddenAt: null, ...visibleTo(user) } });
        if (!review) return null;
        const revealed = await this.db.review.count({
          where: { id, ...revealedAbout(review.revieweeId, this.clock.now()) },
        });
        return revealed > 0 || review.authorId === user.id ? review.authorId : null;
      }
    }
  }

  private async target(db: Tx, type: ReportTarget, id: string): Promise<Target | null> {
    switch (type) {
      case "project": {
        const project = await db.project.findUnique({ where: { id } });
        return (
          project && {
            userId: project.clientId,
            sandboxId: project.sandboxId,
            label: project.title,
            url: `/projetos/${project.id}`,
            hidden: project.hiddenAt !== null,
            content: project.description,
            contactFlags: [],
          }
        );
      }
      case "profile": {
        const person = await db.user.findUnique({
          where: { id },
          include: { freelancerProfile: true, clientProfile: true },
        });
        if (!person) return null;
        const profiles = [person.freelancerProfile, person.clientProfile].filter((p) => p !== null);
        return {
          userId: person.id,
          sandboxId: person.sandboxId,
          label: person.name,
          url: person.freelancerProfile
            ? `/freelancers/${person.id}`
            : person.clientProfile
              ? `/clientes/${person.id}`
              : null,
          hidden: profiles.length > 0 && profiles.every((p) => p.hiddenAt !== null),
          content:
            [
              person.freelancerProfile &&
                `${person.freelancerProfile.headline}\n${person.freelancerProfile.bio}`,
              person.clientProfile?.about,
            ]
              .filter(Boolean)
              .join("\n\n") || null,
          contactFlags: [],
        };
      }
      case "message": {
        const message = await db.message.findUnique({
          where: { id },
          include: { conversation: { include: { project: { select: { title: true } } } } },
        });
        if (!message) return null;
        const sender = await db.user.findUnique({ where: { id: message.senderId }, select: { name: true } });
        return {
          userId: message.senderId,
          sandboxId: message.conversation.sandboxId,
          label: `Mensagem de ${sender?.name ?? "—"} em “${message.conversation.project.title}”`,
          url: null,
          hidden: message.hiddenAt !== null,
          content: message.body,
          contactFlags: message.contactFlags,
        };
      }
      case "review": {
        const review = await db.review.findUnique({
          where: { id },
          include: { author: { select: { name: true } } },
        });
        return (
          review && {
            userId: review.authorId,
            sandboxId: review.sandboxId,
            label: `Avaliação de ${review.author.name} (${review.rating} ★)`,
            url:
              review.revieweeRole === "freelancer"
                ? `/freelancers/${review.revieweeId}`
                : `/clientes/${review.revieweeId}`,
            hidden: review.hiddenAt !== null,
            content: review.comment,
            contactFlags: [],
          }
        );
      }
    }
  }

  private async setHidden(tx: Tx, type: ReportTarget, id: string, at: Date | null): Promise<void> {
    const data = { hiddenAt: at };
    if (type === "project") await tx.project.update({ where: { id }, data });
    else if (type === "message") await tx.message.update({ where: { id }, data });
    else if (type === "review") await tx.review.update({ where: { id }, data });
    else {
      await tx.freelancerProfile.updateMany({ where: { userId: id }, data });
      await tx.clientProfile.updateMany({ where: { userId: id }, data });
    }
  }

  private async view(report: Report, db: Tx = this.db): Promise<{ view: ReportView; target: Target | null }> {
    const [target, author, reporter, sameTarget] = await Promise.all([
      this.target(db, report.targetType, report.targetId),
      db.user.findUnique({
        where: { id: report.targetUserId },
        select: { id: true, name: true, suspendedAt: true },
      }),
      report.reporterId
        ? db.user.findUnique({ where: { id: report.reporterId }, select: { id: true, name: true } })
        : null,
      db.report.count({
        where: {
          targetType: report.targetType,
          targetId: report.targetId,
          sandboxId: report.sandboxId,
          status: "open",
          id: { not: report.id },
        },
      }),
    ]);
    return {
      target,
      view: {
        id: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        details: report.details,
        status: report.status,
        resolution: report.resolution as ReportView["resolution"],
        note: report.note,
        createdAt: report.createdAt.toISOString(),
        resolvedAt: report.resolvedAt?.toISOString() ?? null,
        reporter: reporter && { id: reporter.id, name: reporter.name },
        target: {
          label: target?.label ?? "(removido)",
          url: target?.url ?? null,
          hidden: target?.hidden ?? false,
          author: {
            id: report.targetUserId,
            name: author?.name ?? "—",
            suspended: author?.suspendedAt != null,
          },
        },
        sameTarget,
      },
    };
  }
}

/**
 * A message with contact details before a contract: delivered, and reported by the system in the same
 * transaction (one report per message; the message is written once).
 */
export async function reportFlaggedMessage(
  tx: Tx,
  message: { id: string; senderId: string; contactFlags: string[]; createdAt: Date },
  sandboxId: string | null,
): Promise<void> {
  await tx.report.create({
    data: {
      id: uuidv7(message.createdAt.getTime()),
      reporterId: null,
      targetType: "message",
      targetId: message.id,
      targetUserId: message.senderId,
      reason: "off_platform",
      details: `Detectado automaticamente: ${message.contactFlags.join(", ")}.`,
      sandboxId,
      createdAt: message.createdAt,
    },
  });
}

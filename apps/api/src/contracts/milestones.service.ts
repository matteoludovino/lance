import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { MAX_REVISIONS, REVIEW_WINDOW_DAYS, type MilestoneActionResult } from "@lance/shared";
import type { AuthUser } from "../auth/auth-user.ts";
import { expectChanged, transaction } from "../common/transactions.ts";
import type { MilestoneStatus, Prisma } from "../generated/prisma/client.ts";
import { Ledger, splitFee } from "../ledger/ledger.service.ts";
import { OutboxService, type Tx } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Scheduler } from "../scheduler/scheduler.service.ts";
import { REVIEW_EVENTS } from "../reviews/reviews.service.ts";
import { Clock } from "../time/clock.ts";
import { Idempotency, Replayed, type IdempotencyRequest } from "./idempotency.ts";

export const MILESTONE_CHANGED = "milestone.changed";

export type Change =
  | "funded"
  | "submitted"
  | "approved"
  | "auto_released"
  | "revision_requested"
  | "disputed"
  | "cancelled"
  | "refunded"
  | "resolved_released"
  | "resolved_refunded";

const NOT_FOUND = { code: "not_found", message: "Etapa não encontrada." };
const TERMINAL: MilestoneStatus[] = ["released", "refunded", "cancelled"];
const HOUR = 3_600_000;

type Milestone = Prisma.ContractMilestoneGetPayload<{ include: { contract: true } }>;
type Role = "client" | "freelancer" | "admin";

/**
 * The milestone lifecycle, and the only place that moves money. Every action is one transaction that
 * first locks the contract (actions on one contract run one at a time, in a fixed lock order: contract,
 * then ledger accounts by id), changes the milestone with a conditional update, posts to the ledger, and
 * settles the contract once every milestone is done. Transactions are retried on deadlock.
 */
@Injectable()
export class Milestones implements OnModuleInit {
  private readonly logger = new Logger("Milestones");

  constructor(
    private readonly db: PrismaService,
    private readonly ledger: Ledger,
    private readonly outbox: OutboxService,
    private readonly scheduler: Scheduler,
    private readonly idempotency: Idempotency,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: "auto-release",
      run: (now) => this.releaseDue(now),
      nextDueAt: async () =>
        (
          await this.db.contractMilestone.findFirst({
            where: { status: "submitted", releaseDueAt: { not: null } },
            orderBy: { releaseDueAt: "asc" },
            select: { releaseDueAt: true },
          })
        )?.releaseDueAt ?? null,
    });
  }

  /** The client deposits the milestone's amount: it waits in escrow until approved or refunded. */
  fund(user: AuthUser, id: string, retry?: IdempotencyRequest) {
    return this.act(user, id, ["client"], retry, async (tx, m) => {
      const now = this.clock.now();
      await this.move(
        tx,
        id,
        ["pending_funding"],
        "funded",
        { fundedAt: now },
        "Esta etapa já foi depositada.",
      );
      await this.ledger.post(tx, {
        kind: "fund",
        milestoneId: id,
        sandboxId: m.contract.sandboxId,
        moves: [
          { account: { kind: "external" }, amountCents: -m.amountCents },
          { account: { kind: "escrow", milestoneId: id }, amountCents: m.amountCents },
        ],
      });
      return "funded";
    });
  }

  /** The freelancer delivers; the client has until the due time to approve, ask for a revision or dispute. */
  submit(user: AuthUser, id: string, note: string) {
    return this.act(user, id, ["freelancer"], undefined, async (tx, m) => {
      const now = this.clock.now();
      await this.move(
        tx,
        id,
        ["funded", "revision_requested"],
        "submitted",
        {
          submittedAt: now,
          releaseDueAt: new Date(now.getTime() + m.contract.autoReleaseHours * HOUR),
          deliveryNote: note,
        },
        "Esta etapa não está esperando uma entrega.",
      );
      return "submitted";
    });
  }

  approve(user: AuthUser, id: string, retry?: IdempotencyRequest) {
    return this.act(user, id, ["client"], retry, async (tx, m) => {
      await this.move(
        tx,
        id,
        ["submitted"],
        "released",
        this.settled(),
        "Esta etapa não está esperando aprovação.",
      );
      await this.release(tx, m);
      return "approved";
    });
  }

  requestRevision(user: AuthUser, id: string, note: string) {
    return this.act(user, id, ["client"], undefined, async (tx, m) => {
      if (m.revisionCount >= MAX_REVISIONS) {
        throw new ConflictException({
          code: "revisions_exhausted",
          message: "Você já pediu as duas revisões desta etapa: aprove a entrega ou abra uma disputa.",
        });
      }
      const { count } = await tx.contractMilestone.updateMany({
        where: { id, status: "submitted", revisionCount: { lt: MAX_REVISIONS } },
        data: {
          status: "revision_requested",
          revisionCount: { increment: 1 },
          revisionNote: note,
          releaseDueAt: null,
        },
      });
      expectChanged(count, { code: "conflict", message: "Esta etapa não está esperando aprovação." });
      return "revision_requested";
    });
  }

  /** Either party stops the clock while money is held: an admin then releases or refunds. */
  dispute(user: AuthUser, id: string, reason: string) {
    return this.act(user, id, ["client", "freelancer"], undefined, async (tx) => {
      await this.move(
        tx,
        id,
        ["funded", "submitted", "revision_requested"],
        "disputed",
        { disputedById: user.id, disputeReason: reason, disputedAt: this.clock.now(), releaseDueAt: null },
        "Esta etapa não pode entrar em disputa agora.",
      );
      return "disputed";
    });
  }

  /**
   * Either party alone, while nothing was delivered: an unfunded milestone is just cancelled, a funded
   * one goes back to the client. After a delivery, only a dispute can undo it.
   */
  cancel(user: AuthUser, id: string) {
    return this.act(user, id, ["client", "freelancer"], undefined, async (tx, m) => {
      const unfunded = await tx.contractMilestone.updateMany({
        where: { id, status: "pending_funding" },
        data: { status: "cancelled", ...this.settled() },
      });
      if (unfunded.count === 1) return "cancelled";
      const funded = await tx.contractMilestone.updateMany({
        where: { id, status: "funded", submittedAt: null },
        data: { status: "refunded", ...this.settled() },
      });
      expectChanged(funded.count, {
        code: "not_cancellable",
        message: "Depois de uma entrega, só uma disputa pode cancelar esta etapa.",
      });
      await this.refund(tx, m);
      return "refunded";
    });
  }

  /** An admin decides a dispute: all to the freelancer, or all back to the client (no partial split). */
  resolve(admin: AuthUser, id: string, outcome: "release" | "refund") {
    return this.act(admin, id, ["admin"], undefined, async (tx, m) => {
      await this.move(
        tx,
        id,
        ["disputed"],
        outcome === "release" ? "released" : "refunded",
        {
          ...this.settled(),
          resolvedById: admin.id,
        },
        "Esta etapa não está em disputa.",
      );
      if (outcome === "release") await this.release(tx, m);
      else await this.refund(tx, m);
      return outcome === "release" ? "resolved_released" : "resolved_refunded";
    });
  }

  /**
   * Pays deliveries the client let pass the due time. Run by the scheduler and before a contract is
   * read; each one re-checks its condition under the contract's lock, so racing an approval, a revision
   * request or a dispute, exactly one of them happens.
   */
  async releaseDue(now: Date, contractId?: string): Promise<number> {
    const due = await this.db.contractMilestone.findMany({
      where: { status: "submitted", releaseDueAt: { lte: now }, ...(contractId ? { contractId } : {}) },
      orderBy: { releaseDueAt: "asc" },
      take: 20,
      select: { id: true },
    });
    let released = 0;
    for (const { id } of due) {
      try {
        const changed = await transaction(this.db, async (tx) => {
          const m = await this.locked(tx, id);
          const { count } = await tx.contractMilestone.updateMany({
            where: { id, status: "submitted", releaseDueAt: { lte: now } },
            data: { status: "released", ...this.settled(now) },
          });
          if (count === 0) return false;
          await this.release(tx, m);
          await this.settleContract(tx, m.contractId);
          await this.outbox.add(
            tx,
            MILESTONE_CHANGED,
            { milestoneId: id, change: "auto_released" },
            {
              sandboxId: m.contract.sandboxId,
            },
          );
          return true;
        });
        if (changed) released += 1;
      } catch (error) {
        this.logger.error(`auto-release of ${id} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (released > 0) this.outbox.committed();
    return released;
  }

  private async act(
    user: AuthUser,
    id: string,
    roles: Role[],
    retry: IdempotencyRequest | undefined,
    work: (tx: Tx, milestone: Milestone) => Promise<Change>,
  ): Promise<MilestoneActionResult> {
    const result = await transaction(this.db, async (tx) => {
      if (retry) {
        const replayed = await this.idempotency.claim<MilestoneActionResult>(tx, retry);
        if (replayed) return replayed;
      }
      const m = await this.locked(tx, id);
      const role = this.roleOf(user, m);
      if (!role) throw new NotFoundException(NOT_FOUND);
      if (!roles.includes(role)) {
        throw new ForbiddenException({
          code: "not_your_part",
          message: "Esta ação cabe à outra parte do contrato.",
        });
      }
      if (m.contract.status !== "active") {
        throw new ConflictException({ code: "contract_closed", message: "Este contrato já foi encerrado." });
      }
      const change = await work(tx, m);
      await this.settleContract(tx, m.contractId);
      await this.outbox.add(
        tx,
        MILESTONE_CHANGED,
        { milestoneId: id, change },
        { sandboxId: m.contract.sandboxId },
      );
      const after = await tx.contractMilestone.findUniqueOrThrow({ where: { id }, select: { status: true } });
      const answer: MilestoneActionResult = { milestoneId: id, status: after.status };
      if (retry) await this.idempotency.store(tx, retry, { ...answer });
      return answer;
    });
    if (result instanceof Replayed) return result.body;
    this.outbox.committed(); // new events, and maybe a new auto-release due time
    return result;
  }

  /** Locks the milestone's contract (every action on a contract waits its turn), then reads the milestone. */
  private async locked(tx: Tx, id: string): Promise<Milestone> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM contracts c JOIN contract_milestones m ON m."contractId" = c.id
      WHERE m.id = ${id}::uuid FOR UPDATE OF c`;
    if (rows.length === 0) throw new NotFoundException(NOT_FOUND);
    return tx.contractMilestone.findUniqueOrThrow({ where: { id }, include: { contract: true } });
  }

  private roleOf(user: AuthUser, m: Milestone): Role | null {
    if (user.id === m.contract.clientId) return "client";
    if (user.id === m.contract.freelancerId) return "freelancer";
    // Admins see real contracts; a demo's admin persona (stage 9) sees its own sandbox's.
    if (user.role === "admin" && user.sandboxId === m.contract.sandboxId) return "admin";
    return null;
  }

  private async move(
    tx: Tx,
    id: string,
    from: MilestoneStatus[],
    to: MilestoneStatus,
    data: Prisma.ContractMilestoneUpdateManyMutationInput,
    message: string,
  ): Promise<void> {
    const { count } = await tx.contractMilestone.updateMany({
      where: { id, status: { in: from } },
      data: { ...data, status: to },
    });
    expectChanged(count, { code: "conflict", message });
  }

  private settled(now = this.clock.now()) {
    return { settledAt: now, releaseDueAt: null };
  }

  private async release(tx: Tx, m: Milestone): Promise<void> {
    const { feeCents, payoutCents } = splitFee(m.amountCents, m.contract.feeBps);
    await this.ledger.post(tx, {
      kind: "release",
      milestoneId: m.id,
      sandboxId: m.contract.sandboxId,
      moves: [
        { account: { kind: "escrow", milestoneId: m.id }, amountCents: -m.amountCents },
        { account: { kind: "wallet", userId: m.contract.freelancerId }, amountCents: payoutCents },
        { account: { kind: "revenue" }, amountCents: feeCents },
      ],
    });
  }

  private async refund(tx: Tx, m: Milestone): Promise<void> {
    await this.ledger.post(tx, {
      kind: "refund",
      milestoneId: m.id,
      sandboxId: m.contract.sandboxId,
      moves: [
        { account: { kind: "escrow", milestoneId: m.id }, amountCents: -m.amountCents },
        { account: { kind: "external" }, amountCents: m.amountCents },
      ],
    });
  }

  /** Once every milestone is settled, the contract (and its project) is completed, or cancelled if nothing was paid. */
  private async settleContract(tx: Tx, contractId: string): Promise<void> {
    const milestones = await tx.contractMilestone.findMany({
      where: { contractId },
      select: { status: true },
    });
    if (milestones.some((m) => !TERMINAL.includes(m.status))) return;
    const paid = milestones.some((m) => m.status === "released");
    const now = this.clock.now();
    const contract = await tx.contract.update({
      where: { id: contractId },
      data: { status: paid ? "completed" : "cancelled", completedAt: now },
    });
    await tx.project.update({
      where: { id: contract.projectId },
      data: { status: paid ? "completed" : "cancelled" },
    });
    if (paid) {
      // Reviews open now: both are invited, and when the window closes a lone review is revealed.
      const sandboxId = contract.sandboxId;
      await this.outbox.add(tx, REVIEW_EVENTS.requested, { contractId }, { sandboxId });
      await this.outbox.add(
        tx,
        REVIEW_EVENTS.windowClosed,
        { contractId },
        {
          sandboxId,
          dueAt: new Date(now.getTime() + REVIEW_WINDOW_DAYS * 24 * HOUR),
        },
      );
    }
  }
}

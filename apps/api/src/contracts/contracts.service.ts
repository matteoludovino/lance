import { Injectable, NotFoundException } from "@nestjs/common";
import {
  type DisputeView,
  HELD,
  MAX_REVISIONS,
  type ContractSummary,
  type ContractView,
  type MilestoneStatus,
  type MilestoneView,
  type WalletView,
} from "@lance/shared";
import type { AuthUser } from "../auth/auth-user.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { Ledger, splitFee } from "../ledger/ledger.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Clock } from "../time/clock.ts";
import { Milestones } from "./milestones.service.ts";

const include = {
  project: { select: { id: true, title: true, status: true } },
  client: { select: { id: true, name: true } },
  freelancer: { select: { id: true, name: true } },
  milestones: { orderBy: { position: "asc" } },
} satisfies Prisma.ContractInclude;

type Row = Prisma.ContractGetPayload<{ include: typeof include }>;

/** What a milestone waits for, by who has to act. */
const WAITING_ON: Record<"client" | "freelancer", MilestoneStatus[]> = {
  client: ["pending_funding", "submitted"],
  freelancer: ["funded", "revision_requested"],
};

/** Reading contracts and the freelancer's wallet. */
@Injectable()
export class Contracts {
  constructor(
    private readonly db: PrismaService,
    private readonly milestones: Milestones,
    private readonly ledger: Ledger,
    private readonly clock: Clock,
  ) {}

  /** One contract, for its two parties (or an admin). Deliveries past their due time are paid first. */
  async view(viewer: AuthUser, id: string): Promise<ContractView> {
    await this.milestones.releaseDue(this.clock.now(), id);
    const contract = await this.db.contract.findUnique({ where: { id }, include });
    const role = contract ? roleOf(viewer, contract) : null;
    if (!contract || !role)
      throw new NotFoundException({ code: "not_found", message: "Contrato não encontrado." });
    const milestones = contract.milestones.map((m) => milestoneView(m, contract));
    const sum = (statuses: MilestoneStatus[]) =>
      milestones.filter((m) => statuses.includes(m.status)).reduce((total, m) => total + m.amountCents, 0);
    return {
      id: contract.id,
      status: contract.status,
      project: contract.project,
      client: contract.client,
      freelancer: contract.freelancer,
      role,
      priceCents: Number(contract.priceCents),
      feeBps: contract.feeBps,
      autoReleaseHours: contract.autoReleaseHours,
      createdAt: contract.createdAt.toISOString(),
      completedAt: contract.completedAt?.toISOString() ?? null,
      milestones,
      totals: { heldCents: sum(HELD), releasedCents: sum(["released"]), refundedCents: sum(["refunded"]) },
    };
  }

  /** The viewer's contracts on both sides, active first. */
  async mine(user: AuthUser): Promise<ContractSummary[]> {
    const rows = await this.db.contract.findMany({
      where: { OR: [{ clientId: user.id }, { freelancerId: user.id }] },
      include,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return rows.map((contract) => {
      const role = contract.clientId === user.id ? "client" : "freelancer";
      return {
        id: contract.id,
        status: contract.status,
        project: { id: contract.project.id, title: contract.project.title },
        role,
        other: role === "client" ? contract.freelancer : contract.client,
        priceCents: Number(contract.priceCents),
        releasedCents: contract.milestones
          .filter((m) => m.status === "released")
          .reduce((total, m) => total + Number(m.amountCents), 0),
        waitingOnYou:
          contract.status === "active"
            ? contract.milestones.filter((m) => WAITING_ON[role].includes(m.status)).length
            : 0,
      };
    });
  }

  /** What the freelancer earned (after fees). There are no withdrawals in this simulation. */
  async wallet(user: AuthUser): Promise<WalletView> {
    const balance = await this.ledger.balance(this.db, { kind: "wallet", userId: user.id }, user.sandboxId);
    const entries = await this.db.ledgerEntry.findMany({
      where: { account: { kind: "wallet", userId: user.id, sandboxId: user.sandboxId } },
      include: {
        transaction: {
          include: {
            milestone: { include: { contract: { include: { project: { select: { title: true } } } } } },
          },
        },
      },
      orderBy: { id: "desc" },
      take: 100,
    });
    return {
      balanceCents: Number(balance),
      entries: entries.map((entry) => ({
        at: entry.transaction.createdAt.toISOString(),
        amountCents: Number(entry.amountCents),
        milestone: entry.transaction.milestone.title,
        project: entry.transaction.milestone.contract.project.title,
        contractId: entry.transaction.milestone.contractId,
      })),
    };
  }

  /** Milestones in dispute in the admin's corner, oldest first: what waits for a decision. */
  async disputes(admin: AuthUser): Promise<DisputeView[]> {
    const rows = await this.db.contractMilestone.findMany({
      where: { status: "disputed", contract: { sandboxId: admin.sandboxId } },
      include: {
        contract: {
          include: { project: { select: { id: true, title: true } }, client: true, freelancer: true },
        },
      },
      orderBy: [{ disputedAt: "asc" }, { id: "asc" }],
    });
    return rows.map((m) => {
      const { client, freelancer } = m.contract;
      const by = m.disputedById === client.id ? client : freelancer;
      return {
        milestoneId: m.id,
        title: m.title,
        amountCents: Number(m.amountCents),
        reason: m.disputeReason,
        disputedAt: (m.disputedAt ?? m.createdAt).toISOString(),
        disputedBy: { id: by.id, name: by.name },
        contract: { id: m.contractId, project: m.contract.project },
        client: { id: client.id, name: client.name },
        freelancer: { id: freelancer.id, name: freelancer.name },
      };
    });
  }
}

function roleOf(viewer: AuthUser, contract: Row): ContractView["role"] | null {
  if (viewer.id === contract.clientId) return "client";
  if (viewer.id === contract.freelancerId) return "freelancer";
  if (viewer.role === "admin" && viewer.sandboxId === contract.sandboxId) return "admin";
  return null;
}

function milestoneView(m: Row["milestones"][number], contract: Row): MilestoneView {
  const { feeCents, payoutCents } = splitFee(m.amountCents, contract.feeBps);
  return {
    id: m.id,
    position: m.position,
    title: m.title,
    amountCents: Number(m.amountCents),
    feeCents: Number(feeCents),
    payoutCents: Number(payoutCents),
    status: m.status,
    fundedAt: m.fundedAt?.toISOString() ?? null,
    submittedAt: m.submittedAt?.toISOString() ?? null,
    releaseDueAt: m.releaseDueAt?.toISOString() ?? null,
    settledAt: m.settledAt?.toISOString() ?? null,
    revisionsLeft: MAX_REVISIONS - m.revisionCount,
    deliveryNote: m.deliveryNote,
    revisionNote: m.revisionNote,
    dispute:
      m.disputedById && m.disputeReason && m.disputedAt
        ? {
            by: m.disputedById === contract.clientId ? "client" : "freelancer",
            reason: m.disputeReason,
            at: m.disputedAt.toISOString(),
          }
        : null,
  };
}

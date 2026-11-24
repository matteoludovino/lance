import { z } from "zod";
import type { Person, ProjectStatus } from "./projects";

export type ContractStatus = "active" | "completed" | "cancelled";
export type MilestoneStatus =
  | "pending_funding"
  | "funded"
  | "submitted"
  | "revision_requested"
  | "disputed"
  | "released"
  | "refunded"
  | "cancelled";

/** How many times a client can send a delivery back before approving or disputing. */
export const MAX_REVISIONS = 2;

export const deliveryInput = z.object({ note: z.string().trim().min(10).max(2000) });
export const revisionInput = z.object({ note: z.string().trim().min(10).max(2000) });
export const disputeInput = z.object({ reason: z.string().trim().min(20).max(2000) });
export const resolveInput = z.object({ outcome: z.enum(["release", "refund"]) });

/** Sent as the Idempotency-Key header on requests that move money, and reused when retrying them. */
export const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/);

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending_funding: "Aguardando depósito",
  funded: "Em andamento",
  submitted: "Entregue, aguardando aprovação",
  revision_requested: "Revisão pedida",
  disputed: "Em disputa",
  released: "Pago",
  refunded: "Reembolsado",
  cancelled: "Cancelada",
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

/** The money sits in escrow in these states. */
export const HELD: MilestoneStatus[] = ["funded", "submitted", "revision_requested", "disputed"];

export interface MilestoneView {
  id: string;
  position: number;
  title: string;
  amountCents: number;
  /** The platform's part, rounded down; payout is the rest. */
  feeCents: number;
  payoutCents: number;
  status: MilestoneStatus;
  fundedAt: string | null;
  submittedAt: string | null;
  /** While a delivery waits for the client: when it is paid on its own. */
  releaseDueAt: string | null;
  settledAt: string | null;
  revisionsLeft: number;
  deliveryNote: string | null;
  revisionNote: string | null;
  dispute: { by: "client" | "freelancer"; reason: string; at: string } | null;
}

export interface ContractView {
  id: string;
  status: ContractStatus;
  project: { id: string; title: string; status: ProjectStatus };
  client: Person;
  freelancer: Person;
  /** Who is looking. */
  role: "client" | "freelancer" | "admin";
  priceCents: number;
  feeBps: number;
  autoReleaseHours: number;
  createdAt: string;
  completedAt: string | null;
  milestones: MilestoneView[];
  totals: { heldCents: number; releasedCents: number; refundedCents: number };
}

export interface ContractSummary {
  id: string;
  status: ContractStatus;
  project: { id: string; title: string };
  role: "client" | "freelancer";
  other: Person;
  priceCents: number;
  releasedCents: number;
  /** Milestones waiting on the viewer (fund, approve, deliver…). */
  waitingOnYou: number;
}

export interface WalletView {
  balanceCents: number;
  entries: { at: string; amountCents: number; milestone: string; project: string; contractId: string }[];
}

/** Answer of the money-moving actions (stored for idempotent retries). */
export interface MilestoneActionResult {
  milestoneId: string;
  status: MilestoneStatus;
}

import { z } from "zod";
import type { Person } from "./projects";

export const REPORT_TARGETS = ["project", "profile", "message", "review"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

/** What people pick from (off_platform is also raised by the system for flagged messages). */
export const REPORT_REASONS = ["spam", "fraud", "offensive", "off_platform", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam ou propaganda",
  fraud: "Golpe ou fraude",
  offensive: "Conteúdo ofensivo ou assédio",
  off_platform: "Contato ou pagamento fora do Lance",
  other: "Outro motivo",
};

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  project: "Projeto",
  profile: "Perfil",
  message: "Mensagem",
  review: "Avaliação",
};

export const reportInput = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .trim()
    .max(1000)
    .transform((value) => value || null)
    .nullable()
    .default(null),
});
export type ReportInput = z.input<typeof reportInput>;

export type ReportStatus = "open" | "actioned" | "dismissed";
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Aberta",
  actioned: "Resolvida com ação",
  dismissed: "Descartada",
};

/** hide: the content leaves every listing; suspend: its author can't sign in and disappears. */
export const MODERATION_ACTIONS = ["hide", "suspend", "dismiss"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const resolveReportInput = z.object({
  action: z.enum(MODERATION_ACTIONS),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || null)
    .nullable()
    .default(null),
});

export const reportListFilters = z.object({
  status: z.enum(["open", "closed"]).default("open"),
});

/** A report in the admin's queue: never a message's text (reading one is logged; see ReportDetail). */
export interface ReportView {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolution: "hidden" | "suspended" | "dismissed" | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** Null: raised automatically (contact details in a message before a contract). */
  reporter: Person | null;
  target: {
    /** What it is, for the list: a project's title, a person's name, "Mensagem de …", "Avaliação de …". */
    label: string;
    /** Where it lives in the app, if it has a page. */
    url: string | null;
    hidden: boolean;
    author: Person & { suspended: boolean };
  };
  /** Other open reports about the same thing. */
  sameTarget: number;
}

/** One report opened by an admin, with the reported content itself. Opening it is audited. */
export interface ReportDetail extends ReportView {
  content: string | null;
  /** For messages, which contact details were spotted. */
  contactFlags: string[];
}

export interface AuditEntryView {
  id: string;
  actor: Person;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "report.viewed": "Abriu uma denúncia",
  "report.hidden": "Ocultou conteúdo",
  "report.suspended": "Suspendeu uma conta",
  "report.dismissed": "Descartou uma denúncia",
  "report.reopened": "Desfez uma decisão",
  "dispute.resolved": "Decidiu uma disputa",
};

/** A milestone in dispute, for the admin. */
export interface DisputeView {
  milestoneId: string;
  title: string;
  amountCents: number;
  reason: string | null;
  disputedAt: string;
  disputedBy: Person;
  contract: { id: string; project: { id: string; title: string } };
  client: Person;
  freelancer: Person;
}

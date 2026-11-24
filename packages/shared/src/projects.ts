import { z } from "zod";
import { CATEGORY_SLUGS, SKILL_SLUGS } from "./catalog";
import { cents } from "./money";

const uniqueSkills = z
  .array(z.enum(SKILL_SLUGS))
  .min(1)
  .max(8)
  .refine((skills) => new Set(skills).size === skills.length, { message: "repeated skill" });

/** A client's project: what they need and the budget range (fixed price; no hourly contracts here). */
export const projectInput = z
  .object({
    title: z.string().trim().min(10).max(100),
    description: z.string().trim().min(30).max(5000),
    category: z.enum(CATEGORY_SLUGS),
    skills: uniqueSkills,
    budgetMinCents: cents.min(5_000).max(100_000_000),
    budgetMaxCents: cents.min(5_000).max(100_000_000),
  })
  .refine((project) => project.budgetMinCents <= project.budgetMaxCents, {
    path: ["budgetMaxCents"],
    message: "below minimum",
  });
export type ProjectInput = z.input<typeof projectInput>;

export const createProjectInput = projectInput.and(z.object({ publish: z.boolean() }));

/** One step of the work, paid on its own when approved. */
export const milestoneInput = z.object({
  title: z.string().trim().min(3).max(80),
  amountCents: cents.min(1_000).max(100_000_000),
});

/**
 * A freelancer's proposal: the work split into milestones. The price is their sum, so "the milestones
 * add up to the agreed price" holds by construction.
 */
export const proposalInput = z.object({
  coverLetter: z.string().trim().min(30).max(3000),
  deliveryDays: z.number().int().min(1).max(365),
  milestones: z.array(milestoneInput).min(1).max(5),
});
export type ProposalInput = z.input<typeof proposalInput>;

/** Accepting names the version the client looked at: if the freelancer changed it since, 409. */
export const acceptInput = z.object({ version: z.number().int().positive() });

export type ProjectStatus = "draft" | "open" | "in_progress" | "completed" | "cancelled";
export type ProposalStatus = "submitted" | "withdrawn" | "declined" | "accepted";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Rascunho",
  open: "Recebendo propostas",
  in_progress: "Em andamento",
  completed: "Concluído",
  cancelled: "Encerrado",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  submitted: "Enviada",
  withdrawn: "Retirada",
  declined: "Não escolhida",
  accepted: "Aceita",
};

export function proposalPrice(milestones: { amountCents: number }[]): number {
  return milestones.reduce((sum, milestone) => sum + milestone.amountCents, 0);
}

export interface Person {
  id: string;
  name: string;
}

/** A project in a list. */
export interface ProjectSummary {
  id: string;
  title: string;
  category: string;
  skills: string[];
  budgetMinCents: number;
  budgetMaxCents: number;
  status: ProjectStatus;
  publishedAt: string | null;
  client: Person & { company: string | null };
  /** Proposals still in the running (submitted), as the viewer may see them. */
  proposalCount: number;
}

export interface ProjectDetail extends ProjectSummary {
  description: string;
  createdAt: string;
  /** The viewer's own proposal, if they sent one. */
  myProposal: ProposalView | null;
  isOwner: boolean;
  /** Set once a proposal was accepted. */
  contractId: string | null;
}

export interface ProposalView {
  id: string;
  projectId: string;
  status: ProposalStatus;
  version: number;
  coverLetter: string;
  deliveryDays: number;
  /** Seen only by its author and the project's owner. */
  priceCents: number;
  milestones: { title: string; amountCents: number }[];
  freelancer: Person & { headline: string | null };
  submittedAt: string;
  /** The two people's conversation about this project. */
  conversationId: string | null;
}

/** The freelancer's list: their proposals with the project they're for. */
export interface MyProposal extends ProposalView {
  project: { id: string; title: string; status: ProjectStatus };
}

export interface Page<T> {
  items: T[];
  /** Pass back as `cursor` for the next page; null on the last one. */
  next: string | null;
}

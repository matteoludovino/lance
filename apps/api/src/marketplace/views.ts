import type { MyProposal, ProjectDetail, ProjectSummary, ProposalView } from "@lance/shared";
import type { Prisma } from "../generated/prisma/client.ts";

/** What every project query loads to build a summary. */
export const projectInclude = {
  client: { select: { id: true, name: true, clientProfile: { select: { company: true } } } },
} satisfies Prisma.ProjectInclude;

export type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export function projectSummary(project: ProjectRow, proposalCount: number): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    category: project.category,
    skills: project.skills,
    budgetMinCents: Number(project.budgetMinCents),
    budgetMaxCents: Number(project.budgetMaxCents),
    status: project.status,
    publishedAt: project.publishedAt?.toISOString() ?? null,
    client: {
      id: project.client.id,
      name: project.client.name,
      company: project.client.clientProfile?.company ?? null,
    },
    proposalCount,
  };
}

export function projectDetail(
  project: ProjectRow & { contract: { id: string } | null },
  extra: { proposalCount: number; myProposal: ProposalView | null; isOwner: boolean },
): ProjectDetail {
  return {
    ...projectSummary(project, extra.proposalCount),
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    myProposal: extra.myProposal,
    isOwner: extra.isOwner,
    contractId: project.contract?.id ?? null,
  };
}

export const proposalInclude = {
  freelancer: { select: { id: true, name: true, freelancerProfile: { select: { headline: true } } } },
  project: {
    select: {
      id: true,
      title: true,
      status: true,
      conversations: { select: { id: true, freelancerId: true } },
    },
  },
} satisfies Prisma.ProposalInclude;

export type ProposalRow = Prisma.ProposalGetPayload<{ include: typeof proposalInclude }>;

export function proposalView(proposal: ProposalRow): ProposalView {
  return {
    id: proposal.id,
    projectId: proposal.projectId,
    status: proposal.status,
    version: proposal.version,
    coverLetter: proposal.coverLetter,
    deliveryDays: proposal.deliveryDays,
    priceCents: Number(proposal.priceCents),
    milestones: proposal.milestones as ProposalView["milestones"],
    freelancer: {
      id: proposal.freelancer.id,
      name: proposal.freelancer.name,
      headline: proposal.freelancer.freelancerProfile?.headline ?? null,
    },
    submittedAt: proposal.submittedAt.toISOString(),
    conversationId:
      proposal.project.conversations.find((c) => c.freelancerId === proposal.freelancerId)?.id ?? null,
  };
}

export function myProposal(proposal: ProposalRow): MyProposal {
  const { id, title, status } = proposal.project;
  return { ...proposalView(proposal), project: { id, title, status } };
}

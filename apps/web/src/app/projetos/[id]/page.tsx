import {
  PROJECT_STATUS_LABELS,
  categoryLabel,
  skillLabel,
  type ProjectDetail,
  type ProposalView,
} from "@lance/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProfileSkeleton, Section, Unavailable } from "@/components/profile-page";
import { ago, budget } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import { FreelancerPanel } from "./freelancer-panel";
import { OwnerPanel } from "./owner-panel";

export const metadata: Metadata = { title: "Projeto" };

export default function ProjectPage({ params }: PageProps<"/projetos/[id]">) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Suspense fallback={<ProfileSkeleton />}>
        <Project params={params} />
      </Suspense>
    </main>
  );
}

async function Project({ params }: { params: PageProps<"/projetos/[id]">["params"] }) {
  const { id } = await params;
  const result = await serverGet<ProjectDetail>(`/projects/${encodeURIComponent(id)}`);
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") return <Unavailable />;
  const project = result.data;
  // The owner sees every proposal; anyone else, only their own (inside the project).
  const proposals = project.isOwner
    ? await serverGet<ProposalView[]>(`/projects/${project.id}/proposals`)
    : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <article className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-sm font-medium text-indigo-700">{PROJECT_STATUS_LABELS[project.status]}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.title}</h1>
          <p className="text-sm text-stone-500">
            <Link
              href={`/clientes/${project.client.id}`}
              className="font-medium text-stone-700 hover:underline"
            >
              {project.client.company ?? project.client.name}
            </Link>{" "}
            · {categoryLabel(project.category)}
            {project.publishedAt ? ` · publicado ${ago(project.publishedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm shadow-sm">
          <span>
            Orçamento:{" "}
            <strong className="font-semibold">
              {budget(project.budgetMinCents, project.budgetMaxCents)}
            </strong>
          </span>
          <span className="text-stone-500">preço fechado, pago por etapas</span>
        </div>
        <Section title="Descrição">
          <p className="leading-relaxed whitespace-pre-line text-stone-800">{project.description}</p>
        </Section>
        <Section title="Habilidades">
          <ul className="flex flex-wrap gap-1.5">
            {project.skills.map((skill) => (
              <li key={skill} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
                {skillLabel(skill)}
              </li>
            ))}
          </ul>
        </Section>
        {project.isOwner ? (
          <OwnerPanel project={project} proposals={proposals?.status === "ok" ? proposals.data : null} />
        ) : null}
      </article>
      <aside className="grid gap-4 lg:sticky lg:top-6">
        {project.isOwner ? <OwnerActions project={project} /> : <FreelancerPanel project={project} />}
      </aside>
    </div>
  );
}

function OwnerActions({ project }: { project: ProjectDetail }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600 shadow-sm">
      <p className="font-medium text-stone-900">Este projeto é seu.</p>
      <p>
        {project.status === "draft"
          ? "É um rascunho: só você o vê. Publique para receber propostas."
          : project.status === "open"
            ? "Compare as propostas abaixo e aceite a que fizer mais sentido."
            : project.status === "in_progress"
              ? "Você aceitou uma proposta: o contrato foi criado."
              : "Este projeto foi encerrado."}
      </p>
    </div>
  );
}

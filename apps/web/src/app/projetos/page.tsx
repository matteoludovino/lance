import { CATEGORIES, SKILLS, categoryLabel, skillLabel, type Page, type ProjectSummary } from "@lance/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProjectCard } from "@/components/project-card";
import { Unavailable } from "@/components/profile-page";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Projetos" };

type Search = PageProps<"/projetos">["searchParams"];

export default function ProjectsPage({ searchParams }: PageProps<"/projetos">) {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projetos recebendo propostas</h1>
        <p className="text-stone-600">
          Escolha um projeto, proponha um preço dividido em etapas e combine com o cliente.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Projects searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function Projects({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const category = one(params.category);
  const skill = one(params.skill);
  const cursor = one(params.cursor);
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (skill) query.set("skill", skill);
  if (cursor) query.set("cursor", cursor);
  const result = await serverGet<Page<ProjectSummary>>(`/projects?${query}`);
  if (result.status !== "ok") return <Unavailable />;
  const { items, next } = result.data;
  const nextQuery = new URLSearchParams(query);
  if (next) nextQuery.set("cursor", next);

  return (
    <div className="grid gap-6 md:grid-cols-[14rem_1fr] md:items-start">
      <Filters category={category} skill={skill} />
      <section aria-label="Projetos" className="grid gap-4">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-600">
            Nenhum projeto aberto com esses filtros agora.
          </p>
        ) : (
          items.map((project) => <ProjectCard key={project.id} project={project} />)
        )}
        <nav className="flex gap-3" aria-label="Páginas">
          {cursor ? (
            <Link
              href={`/projetos?${new URLSearchParams({ ...(category && { category }), ...(skill && { skill }) })}`}
              className="text-sm font-medium text-indigo-700 hover:underline"
            >
              ← Voltar ao início
            </Link>
          ) : null}
          {next ? (
            <Link
              href={`/projetos?${nextQuery}`}
              className="text-sm font-medium text-indigo-700 hover:underline"
            >
              Mais projetos →
            </Link>
          ) : null}
        </nav>
      </section>
    </div>
  );
}

/** A plain GET form: filters are in the address, so a filtered list can be shared and reloaded. */
function Filters({ category, skill }: { category?: string; skill?: string }) {
  const select =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/20 focus:outline-none";
  return (
    <form
      action="/projetos"
      className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <label className="grid gap-1.5 text-sm font-medium text-stone-800">
        Categoria
        <select name="category" defaultValue={category ?? ""} className={select}>
          <option value="">Todas</option>
          {CATEGORIES.map((option) => (
            <option key={option.slug} value={option.slug}>
              {categoryLabel(option.slug)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-stone-800">
        Habilidade
        <select name="skill" defaultValue={skill ?? ""} className={select}>
          <option value="">Todas</option>
          {SKILLS.map((option) => (
            <option key={option.slug} value={option.slug}>
              {skillLabel(option.slug)}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700">
        Filtrar
      </button>
    </form>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy className="grid gap-4">
      {[0, 1, 2].map((n) => (
        <div key={n} className="h-36 animate-pulse rounded-2xl bg-stone-200/70" />
      ))}
    </div>
  );
}

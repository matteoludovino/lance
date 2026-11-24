import { PROJECT_SORT_LABELS, projectFilters, type ProjectResults } from "@lance/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectCard } from "@/components/project-card";
import { Unavailable } from "@/components/profile-page";
import { FiltersPanel, SearchForm } from "@/components/search/search-form";
import {
  ApplyButton,
  CategoryFilter,
  EmptyResults,
  Field,
  InvalidFilters,
  Pager,
  ResultCount,
  ResultsSkeleton,
  SearchBar,
  SkillFilter,
  asObject,
  control,
  pick,
} from "@/components/search/filters";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Projetos" };

const NAMES = ["q", "category", "skills", "minBudget", "maxBudget", "sort", "cursor"] as const;

export default function ProjectsPage({ searchParams }: PageProps<"/projetos">) {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projetos recebendo propostas</h1>
        <p className="text-stone-600">
          Escolha um projeto, proponha um preço dividido em etapas e combine com o cliente.
        </p>
      </div>
      <Suspense fallback={<ResultsSkeleton />}>
        <Projects searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Projects({ searchParams }: { searchParams: PageProps<"/projetos">["searchParams"] }) {
  const query = pick(await searchParams, NAMES);
  const parsed = projectFilters.safeParse(asObject(query));
  if (!parsed.success) return <InvalidFilters clear="/projetos" />;
  const filters = parsed.data;
  const result = await serverGet<ProjectResults>(`/projects?${query}`);
  if (result.status !== "ok") return <Unavailable />;
  const { items, next, total, facets } = result.data;
  const active =
    (filters.category ? 1 : 0) +
    filters.skills.length +
    (filters.minBudget !== undefined ? 1 : 0) +
    (filters.maxBudget !== undefined ? 1 : 0);

  return (
    <div className="grid gap-6 md:grid-cols-[15rem_1fr] md:items-start">
      <SearchForm action="/projetos" key={query.toString()}>
        <SearchBar
          q={filters.q}
          placeholder="Busque por palavras: loja virtual, logotipo, power bi…"
          sort={filters.sort}
          sorts={PROJECT_SORT_LABELS}
        />
        <FiltersPanel active={active}>
          <CategoryFilter value={filters.category} facets={facets.categories} />
          <SkillFilter selected={filters.skills} facets={facets.skills} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Paga ao menos (R$)">
              <input
                type="number"
                name="minBudget"
                min={0}
                step={100}
                inputMode="numeric"
                defaultValue={filters.minBudget}
                className={control}
              />
            </Field>
            <Field label="Começa até (R$)">
              <input
                type="number"
                name="maxBudget"
                min={0}
                step={100}
                inputMode="numeric"
                defaultValue={filters.maxBudget}
                className={control}
              />
            </Field>
          </div>
          <ApplyButton clear="/projetos" />
        </FiltersPanel>
      </SearchForm>
      <section aria-label="Resultados" className="grid content-start gap-4">
        <ResultCount total={total} one="projeto aberto" many="projetos abertos" q={filters.q} />
        {items.length === 0 ? (
          <EmptyResults clear="/projetos" />
        ) : (
          items.map((project) => <ProjectCard key={project.id} project={project} />)
        )}
        <Pager base="/projetos" query={query} next={next} />
      </section>
    </div>
  );
}

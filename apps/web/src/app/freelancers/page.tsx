import { FREELANCER_SORT_LABELS, freelancerFilters, type FreelancerResults } from "@lance/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FreelancerCard } from "@/components/freelancer-card";
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

export const metadata: Metadata = { title: "Freelancers" };

const NAMES = ["q", "category", "skills", "budget", "minRating", "available", "sort", "cursor"] as const;

export default function FreelancersPage({ searchParams }: PageProps<"/freelancers">) {
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Freelancers</h1>
        <p className="text-stone-600">
          Encontre quem faz o que você precisa. As notas vêm de avaliações de contratos concluídos.
        </p>
      </div>
      <Suspense fallback={<ResultsSkeleton />}>
        <Freelancers searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Freelancers({ searchParams }: { searchParams: PageProps<"/freelancers">["searchParams"] }) {
  const query = pick(await searchParams, NAMES);
  const parsed = freelancerFilters.safeParse(asObject(query));
  if (!parsed.success) return <InvalidFilters clear="/freelancers" />;
  const filters = parsed.data;
  const result = await serverGet<FreelancerResults>(`/freelancers?${query}`);
  if (result.status !== "ok") return <Unavailable />;
  const { items, next, total, facets } = result.data;
  const active =
    (filters.category ? 1 : 0) +
    filters.skills.length +
    (filters.budget !== undefined ? 1 : 0) +
    (filters.minRating !== undefined ? 1 : 0) +
    (filters.available ? 1 : 0);

  return (
    <div className="grid gap-6 md:grid-cols-[15rem_1fr] md:items-start">
      <SearchForm action="/freelancers" key={query.toString()}>
        <SearchBar
          q={filters.q}
          placeholder="Busque por palavras: shopify, identidade visual, tradução…"
          sort={filters.sort}
          sorts={FREELANCER_SORT_LABELS}
        />
        <FiltersPanel active={active}>
          <CategoryFilter value={filters.category} facets={facets.categories} />
          <SkillFilter selected={filters.skills} facets={facets.skills} />
          <Field label="Orçamento do seu projeto (R$)">
            <input
              type="number"
              name="budget"
              min={0}
              step={100}
              inputMode="numeric"
              defaultValue={filters.budget}
              className={control}
            />
          </Field>
          <Field label="Nota">
            <select name="minRating" defaultValue={filters.minRating?.toString() ?? ""} className={control}>
              <option value="">Qualquer nota</option>
              <option value="4">4 ou mais</option>
              <option value="4.5">4,5 ou mais</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              name="available"
              value="1"
              defaultChecked={filters.available}
              className="size-4 rounded border-stone-300 accent-indigo-600"
            />
            Só quem está disponível agora
          </label>
          <ApplyButton clear="/freelancers" />
        </FiltersPanel>
      </SearchForm>
      <section aria-label="Resultados" className="grid content-start gap-4">
        <ResultCount total={total} one="freelancer" many="freelancers" q={filters.q} />
        {items.length === 0 ? (
          <EmptyResults clear="/freelancers" />
        ) : (
          items.map((freelancer) => <FreelancerCard key={freelancer.id} freelancer={freelancer} />)
        )}
        <Pager base="/freelancers" query={query} next={next} />
      </section>
    </div>
  );
}

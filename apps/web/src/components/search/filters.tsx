import { CATEGORIES, categoryLabel, skillLabel, type Facet } from "@lance/shared";
import Link from "next/link";
import type { ReactNode } from "react";

export const control =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-xs focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/20 focus:outline-none";

/**
 * The words and the order, above the results. "Relevance" is the empty choice: the API then orders by
 * relevance when there are words (and newest first for projects without them), so typing words after
 * browsing never keeps a "newest first" nobody picked.
 */
export function SearchBar({
  q,
  placeholder,
  sort,
  sorts,
}: {
  q?: string;
  placeholder: string;
  /** The order asked for in the address, if any. */
  sort?: string;
  sorts: Record<string, string>;
}) {
  return (
    <div className="flex flex-wrap gap-2 md:col-span-2">
      <label className="min-w-0 flex-[1_1_16rem]">
        <span className="sr-only">Buscar</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={100}
          placeholder={placeholder}
          className={`${control} py-2.5 text-base`}
        />
      </label>
      <label className="flex-[0_1_12rem]">
        <span className="sr-only">Ordenar por</span>
        <select
          name="sort"
          defaultValue={sort === "relevance" ? "" : (sort ?? "")}
          className={`${control} py-2.5`}
        >
          {Object.entries(sorts).map(([value, label]) => (
            <option key={value} value={value === "relevance" ? "" : value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">
        Buscar
      </button>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-800">
      {label}
      {children}
    </label>
  );
}

/** Every category, each with how many results it would have. */
export function CategoryFilter({ value, facets }: { value?: string; facets: Facet[] }) {
  const counts = new Map(facets.map((facet) => [facet.value, facet.count]));
  const all = facets.reduce((sum, facet) => sum + facet.count, 0);
  return (
    <Field label="Categoria">
      <select name="category" defaultValue={value ?? ""} className={control}>
        <option value="">Todas ({all})</option>
        {CATEGORIES.map((category) => (
          <option key={category.slug} value={category.slug}>
            {categoryLabel(category.slug)} ({counts.get(category.slug) ?? 0})
          </option>
        ))}
      </select>
    </Field>
  );
}

const SHOWN_SKILLS = 12;
export const MAX_SKILLS = 5;

/**
 * The skills present in the results, most common first, with counts (ticking one narrows the results to
 * people or projects with all ticked skills). Ticked ones always stay in the list.
 */
export function SkillFilter({ selected, facets }: { selected: string[]; facets: Facet[] }) {
  const counts = new Map(facets.map((facet) => [facet.value, facet.count]));
  const shown = [
    ...selected,
    ...facets.map((facet) => facet.value).filter((skill) => !selected.includes(skill)),
  ].slice(0, Math.max(SHOWN_SKILLS, selected.length));
  const full = selected.length >= MAX_SKILLS;
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-stone-800">Habilidades</legend>
      {shown.length === 0 ? <p className="text-sm text-stone-500">Nenhuma nestes resultados.</p> : null}
      {shown.map((skill) => {
        const checked = selected.includes(skill);
        return (
          <label key={skill} className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              name="skills"
              value={skill}
              defaultChecked={checked}
              disabled={full && !checked}
              className="size-4 rounded border-stone-300 accent-indigo-600"
            />
            <span className="flex-1">{skillLabel(skill)}</span>
            <span className="text-stone-400 tabular-nums">{counts.get(skill) ?? 0}</span>
          </label>
        );
      })}
      {full ? <p className="text-xs text-stone-500">Até {MAX_SKILLS} habilidades por busca.</p> : null}
    </fieldset>
  );
}

export function ApplyButton({ clear }: { clear: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <button className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-700">
        Aplicar
      </button>
      <Link href={clear} className="text-sm text-stone-600 hover:text-stone-900 hover:underline">
        Limpar filtros
      </Link>
    </div>
  );
}

/** "12 projetos para “loja”". */
export function ResultCount({
  total,
  one,
  many,
  q,
}: {
  total: number;
  one: string;
  many: string;
  q?: string;
}) {
  return (
    <p className="text-sm text-stone-600" aria-live="polite">
      <span className="font-medium text-stone-900">{total.toLocaleString("pt-BR")}</span>{" "}
      {total === 1 ? one : many}
      {q ? <> para “{q}”</> : null}
    </p>
  );
}

/** Next page (and back to the first): keyset and offset pages both come as an opaque cursor. */
export function Pager({ base, query, next }: { base: string; query: URLSearchParams; next: string | null }) {
  const first = new URLSearchParams(query);
  first.delete("cursor");
  const following = new URLSearchParams(first);
  if (next) following.set("cursor", next);
  const link = "text-sm font-medium text-indigo-700 hover:underline";
  if (!query.has("cursor") && !next) return null;
  return (
    <nav className="flex gap-4" aria-label="Páginas">
      {query.has("cursor") ? (
        <Link href={`${base}?${first}`} className={link}>
          ← Voltar ao início
        </Link>
      ) : null}
      {next ? (
        <Link href={`${base}?${following}`} className={link}>
          Mais resultados →
        </Link>
      ) : null}
    </nav>
  );
}

export function EmptyResults({ clear }: { clear: string }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-600">
      <p>Nada encontrado com essa busca.</p>
      <p className="text-sm">
        Tente outras palavras ou menos filtros, ou{" "}
        <Link href={clear} className="font-medium text-indigo-700 hover:underline">
          veja tudo
        </Link>
        .
      </p>
    </div>
  );
}

export function InvalidFilters({ clear }: { clear: string }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
      <p>Alguns filtros do endereço não são válidos.</p>
      <Link href={clear} className="text-sm font-medium text-indigo-700 hover:underline">
        Começar uma busca nova
      </Link>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div aria-busy className="grid gap-4 md:grid-cols-[15rem_1fr]">
      <div className="hidden h-80 animate-pulse rounded-2xl bg-stone-200/70 md:block" />
      <div className="grid content-start gap-4">
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-36 animate-pulse rounded-2xl bg-stone-200/70" />
        ))}
      </div>
    </div>
  );
}

type Params = Record<string, string | string[] | undefined>;

/** The address's search parameters, kept to the names a search knows, in a form the API reads. */
export function pick(params: Params, names: readonly string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const name of names) {
    const value = params[name];
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      if (one.trim() !== "") query.append(name, one);
    }
  }
  return query;
}

/** For the zod schemas: one value per name, except lists. */
export function asObject(query: URLSearchParams, lists: readonly string[] = ["skills"]) {
  const object: Record<string, string | string[]> = {};
  for (const name of new Set(query.keys()))
    object[name] = lists.includes(name) ? query.getAll(name) : query.get(name)!;
  return object;
}

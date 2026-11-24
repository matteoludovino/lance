import { z } from "zod";
import { CATEGORY_SLUGS, SKILL_SLUGS } from "./catalog";
import type { Reputation } from "./reviews";
import type { Location } from "./profiles";
import type { Page, ProjectSummary } from "./projects";

/** Results per page, and how deep offset paging (relevance, rating) may go. */
export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_MAX_PAGES = 10;

export const PROJECT_SORTS = ["relevance", "recent", "budget"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];
export const FREELANCER_SORTS = ["relevance", "rating", "price"] as const;
export type FreelancerSort = (typeof FREELANCER_SORTS)[number];

export const PROJECT_SORT_LABELS: Record<ProjectSort, string> = {
  relevance: "Mais relevantes",
  recent: "Mais recentes",
  budget: "Maior orçamento",
};
export const FREELANCER_SORT_LABELS: Record<FreelancerSort, string> = {
  relevance: "Mais relevantes",
  rating: "Melhor avaliados",
  price: "Menor preço",
};

/** Query strings come from plain GET forms: an empty field means "no filter". */
function blank<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

/** `?skills=a&skills=b` (a list) or `?skills=a` (one): either way, a list of known, distinct skills. */
const skills = z
  .preprocess(
    (value) => (value === undefined || value === "" ? [] : Array.isArray(value) ? value : [value]),
    z.array(z.enum(SKILL_SLUGS)).max(5),
  )
  .transform((list) => [...new Set(list)]);

/** Whole reais (what a person types in a filter), not centavos. */
const reais = blank(z.coerce.number().int().min(0).max(1_000_000));

const common = {
  /** Free text, read as a web search: words, "exact phrase", -excluded, or. */
  q: blank(z.string().trim().max(100)),
  category: blank(z.enum(CATEGORY_SLUGS)),
  skills,
  cursor: blank(z.string().max(300)),
};

export const projectFilters = z.object({
  ...common,
  /** Projects that may pay at least this much (their maximum reaches it). */
  minBudget: reais,
  /** Projects that start at most at this much (their minimum fits it). */
  maxBudget: reais,
  sort: blank(z.enum(PROJECT_SORTS)),
});
export type ProjectFilters = z.infer<typeof projectFilters>;

export const freelancerFilters = z.object({
  ...common,
  /** Freelancers who take projects of this budget (their minimum is at most this). */
  budget: reais,
  /** Average of revealed reviews at least this (people without reviews are left out). */
  minRating: blank(z.coerce.number().min(1).max(5)),
  /** Only people taking work now. */
  available: blank(z.enum(["1", "true"]).transform(() => true)),
  sort: blank(z.enum(FREELANCER_SORTS)),
});
export type FreelancerFilters = z.infer<typeof freelancerFilters>;

export interface Facet {
  value: string;
  count: number;
}

/**
 * A page of results, how many there are in all, and the counts beside each filter. Categories are
 * counted as if no category were picked (to switch between them); skills, within the results (adding
 * one narrows them).
 */
export interface SearchPage<T, S extends string> extends Page<T> {
  total: number;
  sort: S;
  facets: { categories: Facet[]; skills: Facet[] };
}

export type ProjectResults = SearchPage<ProjectSummary, ProjectSort>;

/** A freelancer in search results. */
export interface FreelancerCard extends Location {
  id: string;
  name: string;
  headline: string;
  category: string;
  skills: string[];
  minBudgetCents: number;
  available: boolean;
  reputation: Reputation;
}

export type FreelancerResults = SearchPage<FreelancerCard, FreelancerSort>;

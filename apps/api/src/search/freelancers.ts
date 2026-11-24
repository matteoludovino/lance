import {
  BAYESIAN_WEIGHT,
  SEARCH_PAGE_SIZE,
  type Facet,
  type FreelancerFilters,
  type FreelancerSort,
} from "@lance/shared";
import { Prisma } from "../generated/prisma/client.ts";
import type { PrismaService } from "../prisma/prisma.service.ts";
import { countedReviews } from "../reviews/reputation.ts";
import { visibleToSql } from "../sandbox/scope.ts";
import {
  decodeCursor,
  encodeCursor,
  facetsQuery,
  hasRoomAfter,
  offsetOf,
  readFacets,
  textQuery,
  type Position,
} from "./paging.ts";

export interface FreelancerHit {
  id: string;
  /** Revealed reviews counted for ranking, and their plain average. */
  reviews: number;
  average: number | null;
}

export interface FreelancerHits {
  hits: FreelancerHit[];
  next: string | null;
  total: number;
  sort: FreelancerSort;
  facets: { categories: Facet[]; skills: Facet[] };
}

interface Row extends FreelancerHit {
  price: bigint;
}

/**
 * Freelancers matching the filters, ranked by relevance × Bayesian reputation: the text match decides
 * what is about the words, the reputation (shrunk toward the marketplace's mean, so a single 5-star
 * review doesn't beat fifty 4.8s) decides among them. Without words, by reputation alone.
 */
export async function searchFreelancers(
  db: PrismaService,
  viewer: { sandboxId: string | null } | null,
  filters: FreelancerFilters,
  now: Date,
): Promise<FreelancerHits> {
  const q = filters.q;
  const sort: FreelancerSort = filters.sort ?? "relevance";
  const position = decodeCursor(filters.cursor, sort);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`f."hiddenAt" IS NULL`,
    Prisma.sql`u."suspendedAt" IS NULL`,
    visibleToSql(viewer, `f."sandboxId"`),
  ];
  if (q) conditions.push(Prisma.sql`(numnode(query.q) = 0 OR f.search @@ query.q)`);
  if (filters.skills.length > 0) conditions.push(Prisma.sql`f.skills @> ${filters.skills}::text[]`);
  if (filters.budget !== undefined)
    conditions.push(Prisma.sql`f."minBudgetCents" <= ${BigInt(filters.budget) * 100n}`);
  if (filters.minRating !== undefined)
    // As people read it (one decimal place): a 4.45 shown as 4.5 passes "4.5 or more".
    conditions.push(Prisma.sql`round(rep.average::numeric, 1) >= ${filters.minRating}`);
  if (filters.available) conditions.push(Prisma.sql`f.available`);

  // The prior's mean is the average of every review that counts, among the people this viewer can see.
  const base = Prisma.sql`
    WITH query AS (SELECT ${q ? textQuery(q) : Prisma.sql`NULL::tsquery`} AS q),
    rep AS (${countedReviews("freelancer", now, visibleToSql(viewer, `u."sandboxId"`))}),
    prior AS (SELECT COALESCE(SUM(count * average) / NULLIF(SUM(count), 0), 0)::float AS mean FROM rep),
    base AS (
      SELECT f."userId" AS id, f.category, f.skills, f."minBudgetCents" AS price,
             COALESCE(rep.count, 0) AS reviews, rep.average,
             (${BAYESIAN_WEIGHT} * prior.mean + COALESCE(rep.count, 0) * COALESCE(rep.average, 0))
               / (${BAYESIAN_WEIGHT} + COALESCE(rep.count, 0)) AS score,
             ${q ? Prisma.sql`ts_rank_cd(f.search, query.q, 32)` : Prisma.sql`0::real`} AS rank
      FROM freelancer_profiles f
      JOIN users u ON u.id = f."userId"
      LEFT JOIN rep ON rep.id = f."userId"
      CROSS JOIN prior
      CROSS JOIN query
      WHERE ${Prisma.join(conditions, " AND ")}
    )`;

  const inCategory = filters.category ? Prisma.sql`base.category = ${filters.category}` : Prisma.sql`TRUE`;
  const offset = offsetOf(position);
  const [rows, facetRows] = await Promise.all([
    db.$queryRaw<Row[]>`${base}
      SELECT id, reviews, average, price FROM base
      WHERE ${inCategory} AND ${after(position)}
      ORDER BY ${order(sort, Boolean(q))}
      LIMIT ${SEARCH_PAGE_SIZE + 1} OFFSET ${offset}`,
    db.$queryRaw<
      { facet: string; value: string | null; count: number }[]
    >`${base} ${facetsQuery(filters.category)}`,
  ]);

  const page = rows.slice(0, SEARCH_PAGE_SIZE);
  const last = page.at(-1);
  let next: string | null = null;
  if (rows.length > SEARCH_PAGE_SIZE && last) {
    if (sort === "price") next = encodeCursor({ sort, after: [last.price.toString(), last.id] });
    else if (hasRoomAfter(offset)) next = encodeCursor({ sort, offset: offset + SEARCH_PAGE_SIZE });
  }
  return {
    hits: page.map(({ id, reviews, average }) => ({ id, reviews, average })),
    next,
    sort,
    ...readFacets(facetRows),
  };
}

function order(sort: FreelancerSort, hasWords: boolean): Prisma.Sql {
  if (sort === "price") return Prisma.sql`price ASC, id ASC`;
  if (sort === "relevance" && hasWords) return Prisma.sql`rank * score DESC, score DESC, id ASC`;
  return Prisma.sql`score DESC, reviews DESC, id ASC`;
}

/** Keyset for the price order: strictly after the last row of the previous page. */
function after(position: Position | null): Prisma.Sql {
  if (!position || !("after" in position)) return Prisma.sql`TRUE`;
  const [key, id] = position.after;
  if (!/^\d{1,15}$/.test(key)) return Prisma.sql`FALSE`;
  return Prisma.sql`(price, id) > (${BigInt(key)}, ${id}::uuid)`;
}

import { SEARCH_PAGE_SIZE, type Facet, type ProjectFilters, type ProjectSort } from "@lance/shared";
import { Prisma } from "../generated/prisma/client.ts";
import type { PrismaService } from "../prisma/prisma.service.ts";
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

export interface ProjectHits {
  ids: string[];
  next: string | null;
  total: number;
  sort: ProjectSort;
  facets: { categories: Facet[]; skills: Facet[] };
}

interface Row {
  id: string;
  published: Date;
  budget: bigint;
}

/**
 * Open projects matching the filters, as the viewer's view of the marketplace has them: the page's ids
 * in order, the total and the facets (two queries over the same matching set, run side by side).
 * Without words, relevance means nothing: newest first.
 */
export async function searchProjects(
  db: PrismaService,
  viewer: { sandboxId: string | null } | null,
  filters: ProjectFilters,
): Promise<ProjectHits> {
  const q = filters.q;
  const sort: ProjectSort =
    filters.sort === "relevance" && !q ? "recent" : (filters.sort ?? (q ? "relevance" : "recent"));
  const position = decodeCursor(filters.cursor, sort);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.status = 'open'`,
    Prisma.sql`p."hiddenAt" IS NULL`,
    Prisma.sql`u."suspendedAt" IS NULL`,
    visibleToSql(viewer, `p."sandboxId"`),
  ];
  if (q) conditions.push(Prisma.sql`(numnode(query.q) = 0 OR p.search @@ query.q)`);
  if (filters.skills.length > 0) conditions.push(Prisma.sql`p.skills @> ${filters.skills}::text[]`);
  if (filters.minBudget !== undefined)
    conditions.push(Prisma.sql`p."budgetMaxCents" >= ${BigInt(filters.minBudget) * 100n}`);
  if (filters.maxBudget !== undefined)
    conditions.push(Prisma.sql`p."budgetMinCents" <= ${BigInt(filters.maxBudget) * 100n}`);

  const base = Prisma.sql`
    WITH query AS (SELECT ${q ? textQuery(q) : Prisma.sql`NULL::tsquery`} AS q),
    base AS (
      SELECT p.id, p.category, p.skills, p."publishedAt" AS published, p."budgetMaxCents" AS budget,
             ${q ? Prisma.sql`ts_rank_cd(p.search, query.q, 32)` : Prisma.sql`0::real`} AS rank
      FROM projects p
      JOIN users u ON u.id = p."clientId"
      CROSS JOIN query
      WHERE ${Prisma.join(conditions, " AND ")}
    )`;

  const inCategory = filters.category ? Prisma.sql`base.category = ${filters.category}` : Prisma.sql`TRUE`;
  const offset = offsetOf(position);
  const [rows, facetRows] = await Promise.all([
    db.$queryRaw<Row[]>`${base}
      SELECT id, published, budget FROM base
      WHERE ${inCategory} AND ${after(sort, position)}
      ORDER BY ${order(sort)}
      LIMIT ${SEARCH_PAGE_SIZE + 1} OFFSET ${offset}`,
    db.$queryRaw<
      { facet: string; value: string | null; count: number }[]
    >`${base} ${facetsQuery(filters.category)}`,
  ]);

  const page = rows.slice(0, SEARCH_PAGE_SIZE);
  const last = page.at(-1);
  let next: string | null = null;
  if (rows.length > SEARCH_PAGE_SIZE && last) {
    if (sort === "relevance") {
      if (hasRoomAfter(offset)) next = encodeCursor({ sort, offset: offset + SEARCH_PAGE_SIZE });
    } else {
      const key = sort === "recent" ? last.published.toISOString() : last.budget.toString();
      next = encodeCursor({ sort, after: [key, last.id] });
    }
  }
  return { ids: page.map((row) => row.id), next, sort, ...readFacets(facetRows) };
}

function order(sort: ProjectSort): Prisma.Sql {
  switch (sort) {
    case "relevance":
      return Prisma.sql`rank DESC, published DESC, id DESC`;
    case "recent":
      return Prisma.sql`published DESC, id DESC`;
    case "budget":
      return Prisma.sql`budget DESC, id DESC`;
  }
}

/** Keyset: strictly after the last row of the previous page, in the same order. */
function after(sort: ProjectSort, position: Position | null): Prisma.Sql {
  if (!position || !("after" in position)) return Prisma.sql`TRUE`;
  const [key, id] = position.after;
  if (sort === "recent") {
    const at = new Date(key);
    if (Number.isNaN(at.getTime())) return Prisma.sql`FALSE`;
    return Prisma.sql`(published, id) < (${at}, ${id}::uuid)`;
  }
  if (!/^\d{1,15}$/.test(key)) return Prisma.sql`FALSE`;
  return Prisma.sql`(budget, id) < (${BigInt(key)}, ${id}::uuid)`;
}

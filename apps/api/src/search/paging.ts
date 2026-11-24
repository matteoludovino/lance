import { BadRequestException } from "@nestjs/common";
import { SEARCH_MAX_PAGES, SEARCH_PAGE_SIZE, type Facet } from "@lance/shared";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.ts";

/**
 * Where the next page starts. Orders by a stored column (date, price) page by keyset: "after this
 * row", stable while rows come and go. Orders by a computed score (relevance, rating) page by offset,
 * capped at SEARCH_MAX_PAGES: past that, people refine the search instead.
 */
export type Position = { sort: string; offset: number } | { sort: string; after: [string, string] };

const cursorShape = z.union([
  z.object({
    s: z.string(),
    o: z
      .number()
      .int()
      .positive()
      .max((SEARCH_MAX_PAGES - 1) * SEARCH_PAGE_SIZE),
  }),
  z.object({ s: z.string(), k: z.tuple([z.string().max(40), z.uuid()]) }),
]);

export function encodeCursor(position: Position): string {
  const body =
    "offset" in position ? { s: position.sort, o: position.offset } : { s: position.sort, k: position.after };
  return Buffer.from(JSON.stringify(body)).toString("base64url");
}

/** The cursor a previous page gave, for the same order; anything else is a 400 (never a silent page 1). */
export function decodeCursor(cursor: string | undefined, sort: string): Position | null {
  if (!cursor) return null;
  let parsed: z.infer<typeof cursorShape> | null = null;
  try {
    parsed = cursorShape.parse(JSON.parse(Buffer.from(cursor, "base64url").toString()));
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.s !== sort) {
    throw new BadRequestException({ code: "invalid_cursor", message: "Página inválida: refaça a busca." });
  }
  return "o" in parsed ? { sort, offset: parsed.o } : { sort, after: parsed.k };
}

/** The offset of a position (0 for keyset and first pages). */
export function offsetOf(position: Position | null): number {
  return position && "offset" in position ? position.offset : 0;
}

/** Whether offset paging may go one page further. */
export function hasRoomAfter(offset: number): boolean {
  return offset + SEARCH_PAGE_SIZE < SEARCH_MAX_PAGES * SEARCH_PAGE_SIZE;
}

/** The text query, read as a web search ("frase exata", -fora, ou), in Portuguese without accents. */
export function textQuery(q: string): Prisma.Sql {
  return Prisma.sql`websearch_to_tsquery('pt_unaccent', ${q})`;
}

/** Rows of the one facets query → the facets and the total. */
export function readFacets(rows: { facet: string; value: string | null; count: number }[]): {
  total: number;
  facets: { categories: Facet[]; skills: Facet[] };
} {
  const pick = (facet: string) =>
    rows
      .filter((row) => row.facet === facet)
      .map((row) => ({ value: row.value!, count: row.count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return {
    total: rows.find((row) => row.facet === "total")?.count ?? 0,
    facets: { categories: pick("category"), skills: pick("skill") },
  };
}

/**
 * The facets of `base` (a CTE of matching rows with `category` and `skills`), in one query: categories
 * counted without the category filter (to switch between them), skills and the total with it.
 */
export function facetsQuery(category: string | undefined): Prisma.Sql {
  const inCategory = category ? Prisma.sql`base.category = ${category}` : Prisma.sql`TRUE`;
  return Prisma.sql`
    SELECT 'category' AS facet, base.category AS value, COUNT(*)::int AS count FROM base GROUP BY base.category
    UNION ALL
    SELECT 'skill', skill, COUNT(*)::int FROM base, unnest(base.skills) AS skill WHERE ${inCategory} GROUP BY skill
    UNION ALL
    SELECT 'total', NULL, COUNT(*)::int FROM base WHERE ${inCategory}`;
}

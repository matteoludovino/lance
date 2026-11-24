import { REVIEW_WINDOW_DAYS, type Reputation } from "@lance/shared";
import { Prisma, type ReviewRole } from "../generated/prisma/client.ts";
import type { PrismaService } from "../prisma/prisma.service.ts";

const WINDOW_MS = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Revealed reviews about `revieweeId`: seeded history; or the contract's window closed; or the reviewee
 * wrote theirs too (both sides did). The one rule of double-blind, as a query condition: nothing to
 * update when time passes, so nothing can be revealed twice or forgotten.
 */
export function revealedAbout(revieweeId: string, now: Date): Prisma.ReviewWhereInput {
  return {
    OR: [
      { contractId: null },
      { contract: { completedAt: { lte: new Date(now.getTime() - WINDOW_MS) } } },
      { contract: { reviews: { some: { authorId: revieweeId } } } },
    ],
  };
}

/**
 * Count and average of revealed, visible reviews per person, on one side, as rows (id, count, average)
 * for the people `which` picks (a condition on the reviewee, `u`). Only reviews from the person's own
 * corner of the marketplace count: a demo visitor's reviews of a seeded freelancer stay in the visitor's
 * sandbox and never move the seeded freelancer's numbers. Search ranks with this same query.
 */
export function countedReviews(role: ReviewRole, now: Date, which: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT r."revieweeId" AS id, COUNT(*)::int AS count, AVG(r.rating)::float AS average
    FROM reviews r
    JOIN users u ON u.id = r."revieweeId"
    LEFT JOIN contracts c ON c.id = r."contractId"
    WHERE ${which}
      AND r."revieweeRole" = ${role}::"ReviewRole"
      AND r."hiddenAt" IS NULL
      AND r."sandboxId" IS NOT DISTINCT FROM u."sandboxId"
      AND (r."contractId" IS NULL
           OR c."completedAt" <= ${new Date(now.getTime() - WINDOW_MS)}
           OR EXISTS (SELECT 1 FROM reviews mine
                      WHERE mine."contractId" = r."contractId" AND mine."authorId" = r."revieweeId"))
    GROUP BY r."revieweeId"`;
}

export async function reputations(
  db: PrismaService,
  userIds: string[],
  role: ReviewRole,
  now: Date,
): Promise<Map<string, Reputation>> {
  if (userIds.length === 0) return new Map();
  const which = Prisma.sql`u.id IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})`;
  const rows = await db.$queryRaw<{ id: string; count: number; average: number | null }[]>(
    countedReviews(role, now, which),
  );
  const found = new Map(rows.map((row) => [row.id, reputation(row.count, row.average)]));
  return new Map(userIds.map((id) => [id, found.get(id) ?? { count: 0, average: null }]));
}

/** As people read it: one decimal place. */
export function reputation(count: number, average: number | null): Reputation {
  return { count, average: count === 0 || average === null ? null : round(average) };
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

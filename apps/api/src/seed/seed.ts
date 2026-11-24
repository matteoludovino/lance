import { createHash } from "node:crypto";
import { clientProfileInput, freelancerProfileInput, projectInput } from "@lance/shared";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { SEED_CLIENTS, SEED_FREELANCERS } from "./people.ts";
import { SEED_PROJECTS } from "./projects.ts";
import { SEED_REVIEWS } from "./reviews.ts";

/** A stable id per seeded person, so seeding again updates instead of duplicating. */
export function seedId(key: string): string {
  const hex = createHash("sha256").update(`lance-seed:${key}`).digest("hex");
  // UUID version 8 ("custom"), RFC 9562 variant.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const JOINED = new Date("2025-03-01T12:00:00Z");

/** Writes the seeded marketplace. Safe to run again: it updates the same people. */
export async function seedMarketplace(
  db: PrismaClient,
): Promise<{ freelancers: number; clients: number; projects: number; reviews: number }> {
  for (const [index, person] of [...SEED_FREELANCERS, ...SEED_CLIENTS].entries()) {
    const id = seedId(person.key);
    const user = {
      email: `${person.key}@seed.lance.invalid`,
      name: person.name,
      emailVerifiedAt: JOINED,
      sandboxId: null,
    };
    await db.user.upsert({
      where: { id },
      create: { id, ...user, createdAt: new Date(JOINED.getTime() + index * 86_400_000 * 9) },
      update: user,
    });
  }
  for (const { key, profile } of SEED_FREELANCERS) {
    const data = freelancerProfileInput.parse(profile);
    const row = { ...data, minBudgetCents: BigInt(data.minBudgetCents) };
    await db.freelancerProfile.upsert({
      where: { userId: seedId(key) },
      create: { userId: seedId(key), ...row },
      update: row,
    });
  }
  for (const { key, profile } of SEED_CLIENTS) {
    const data = clientProfileInput.parse(profile);
    await db.clientProfile.upsert({
      where: { userId: seedId(key) },
      create: { userId: seedId(key), ...data },
      update: data,
    });
  }
  // Published relative to now, so the marketplace always looks recent.
  const now = Date.now();
  for (const { key, client, daysAgo, project } of SEED_PROJECTS) {
    const data = projectInput.parse(project);
    const row = {
      ...data,
      budgetMinCents: BigInt(data.budgetMinCents),
      budgetMaxCents: BigInt(data.budgetMaxCents),
      status: "open" as const,
      publishedAt: new Date(now - daysAgo * 86_400_000),
    };
    await db.project.upsert({
      where: { id: seedId(`project:${key}`) },
      create: { id: seedId(`project:${key}`), clientId: seedId(client), sandboxId: null, ...row },
      update: row,
    });
  }
  // History: always revealed, no contract. Reviews can't be edited, so existing ones stay as they are.
  for (const review of SEED_REVIEWS) {
    const id = seedId(`review:${review.author}:${review.reviewee}`);
    await db.review.upsert({
      where: { id },
      create: {
        id,
        authorId: seedId(review.author),
        revieweeId: seedId(review.reviewee),
        revieweeRole: review.role,
        rating: review.rating,
        comment: review.comment,
        sandboxId: null,
        createdAt: new Date(now - review.daysAgo * 86_400_000),
      },
      update: {},
    });
  }
  return {
    freelancers: SEED_FREELANCERS.length,
    clients: SEED_CLIENTS.length,
    projects: SEED_PROJECTS.length,
    reviews: SEED_REVIEWS.length,
  };
}

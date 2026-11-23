import { createHash } from "node:crypto";
import { clientProfileInput, freelancerProfileInput } from "@lance/shared";
import type { PrismaClient } from "../generated/prisma/client.ts";
import { SEED_CLIENTS, SEED_FREELANCERS } from "./people.ts";

/** A stable id per seeded person, so seeding again updates instead of duplicating. */
export function seedId(key: string): string {
  const hex = createHash("sha256").update(`lance-seed:${key}`).digest("hex");
  // UUID version 8 ("custom"), RFC 9562 variant.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const JOINED = new Date("2025-03-01T12:00:00Z");

/** Writes the seeded marketplace. Safe to run again: it updates the same people. */
export async function seedMarketplace(db: PrismaClient): Promise<{ freelancers: number; clients: number }> {
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
  return { freelancers: SEED_FREELANCERS.length, clients: SEED_CLIENTS.length };
}

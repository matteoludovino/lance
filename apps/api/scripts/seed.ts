// Usage: npm run db:seed -w @lance/api (uses DATABASE_URL from apps/api/.env)
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { seedMarketplace } from "../src/seed/seed.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"]! }) });
try {
  const { freelancers, clients, projects, reviews } = await seedMarketplace(db);
  console.log(
    `Seeded ${freelancers} freelancers, ${clients} clients, ${projects} open projects, ${reviews} reviews.`,
  );
} finally {
  await db.$disconnect();
}

// Usage: npm run admin:grant -w @lance/api -- someone@example.com
// Makes an existing, verified account an admin. Deliberately a command, not a route: granting admin
// takes access to the database, never a click in the app.
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:grant -w @lance/api -- someone@example.com");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"]! }) });
try {
  const { count } = await db.user.updateMany({
    where: { email, emailVerifiedAt: { not: null }, sandboxId: null },
    data: { role: "admin" },
  });
  if (count === 0) {
    console.error(`No verified, non-demo account with ${email}.`);
    process.exitCode = 1;
  } else console.log(`${email} is now an admin.`);
} finally {
  await db.$disconnect();
}

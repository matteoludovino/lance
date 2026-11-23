import { execFileSync } from "node:child_process";

/** A fresh-enough database (migrated, with the seeded marketplace) for the run. */
export default function setup() {
  const url = process.env["E2E_DATABASE_URL"] ?? "postgresql://lance:lance@localhost:5439/lance_e2e";
  execFileSync("npm", ["run", "db:prepare", "-w", "@lance/api", "--", url], { stdio: "pipe" });
  execFileSync("npm", ["run", "db:seed", "-w", "@lance/api"], {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}

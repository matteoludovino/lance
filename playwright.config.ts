import { defineConfig, devices } from "@playwright/test";

// End-to-end runs against the production builds (npm run build first): the bundled API and `next start`,
// on their usual ports, with a database of their own, sending real email to Mailpit (npm run db:up).
const E2E_DATABASE_URL =
  process.env["E2E_DATABASE_URL"] ?? "postgresql://lance:lance@localhost:5439/lance_e2e";

// The API sits behind the web app's rewrite, as in production, and trusts X-Forwarded-For: each run (and
// each retry, in a fresh worker) is its own client address, so per-address limits don't carry over.
export const CLIENT_IP = `10.${rand()}.${rand()}.${rand()}`;
function rand() {
  return Math.floor(Math.random() * 250) + 1;
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env["CI"] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3030",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    extraHTTPHeaders: { "x-forwarded-for": CLIENT_IP },
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      // Playwright starts the servers before any global setup: the database is prepared (migrated, with
      // the seeded marketplace) right before the API starts.
      command: `npm run db:prepare -w @lance/api -- ${E2E_DATABASE_URL} && npm run db:seed -w @lance/api && npm run start -w @lance/api`,
      url: "http://localhost:8040/api/health",
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        WEB_ORIGINS: "http://localhost:3030",
        WEB_URL: "http://localhost:3030",
        SMTP_URL: "smtp://localhost:1025",
        TRUST_PROXY: "true",
        LOG_LEVEL: "warn",
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run start -w @lance/web",
      url: "http://localhost:3030",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

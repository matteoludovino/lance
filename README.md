# Lance

A two-sided marketplace for digital freelance work: clients post projects, freelancers send proposals, the
client hires one under a contract split into milestones, payment is held in (simulated) escrow and released
when each delivery is approved, both sides review each other, and they talk in real time.

> **Status:** being built in stages (see the roadmap). The interface is in Brazilian Portuguese; code, docs
> and commits are in English.

## What works so far

- **Accounts.** Sign up, confirm the address by email, sign in and out, reset a forgotten password.
  Answers never reveal whether an address has an account; the email tells its owner instead.
- **Two sides, one account.** A client profile (who is hiring) and a freelancer profile (what they do,
  skills from a fixed catalog, "projects from R$ …", availability), with public pages. A header switch
  shows one side or the other; the API checks ownership either way.
- **Seeded marketplace.** Twelve freelancers and five clients, fictional, so the market isn't empty.

## Architecture

An npm-workspaces monorepo:

| Package           | What it is                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| `apps/api`        | NestJS 12 on Fastify, Prisma 7 (Rust-free client, node-postgres), PostgreSQL    |
| `apps/web`        | Next.js 16 (App Router) + Tailwind 4                                            |
| `packages/shared` | Zod schemas and rules used by both sides (validated in the API by a small pipe) |

The browser reaches the API through a `/api` rewrite on the web app's own origin (first-party cookie). The
API is bundled with esbuild, with SWC compiling the TypeScript so NestJS gets its decorator metadata.

A few rules every later feature builds on:

- **Sessions** are database rows behind a random httpOnly, SameSite=Lax cookie (only its SHA-256 is
  stored). State-changing requests must carry the web app's `Origin`. Passwords use Argon2id, at most two
  hashes at a time; logins are rate-limited per client and per address.
- **Emailed links** carry their token in the URL fragment (never sent to a server or in a `Referer`),
  are minted when the email is sent, expire, and work once even when clicked twice at the same moment.
- **Demo isolation.** Everything a person writes carries a `sandbox_id`. Every read goes through one
  rule: the seeded marketplace plus the viewer's own sandbox, never another visitor's.
- **Time** comes from an injectable clock, and side effects (email, and later delayed rules) go through
  a transactional outbox drained by a scheduler inside the API: no external queue for a free-plan
  server that sleeps.

## Running locally

Requirements: Node.js 22.18+, Docker.

```bash
npm install
npm run db:up                      # PostgreSQL on :5439, Mailpit (email catcher) on :8025
cp .env.example apps/api/.env
npm run db:migrate -w @lance/api
npm run db:seed -w @lance/api      # the seeded freelancers and clients
npm run dev                        # API on :8040, web on http://localhost:3030
```

| Script                                        | Does                                                |
| --------------------------------------------- | --------------------------------------------------- |
| `npm test`                                    | All tests (API tests run against a real PostgreSQL) |
| `npm run build && npm run e2e`                | Playwright end-to-end tests, with real email        |
| `npm run lint` / `typecheck` / `format:check` | Across all workspaces                               |
| `npm run build`                               | API bundle and web build                            |
| `docker build -f apps/api/Dockerfile .`       | API image (applies migrations on start)             |

## Roadmap

1. ✅ Monorepo, NestJS API, Next.js web, CI (minimal deploy pending)
2. ✅ Accounts, sessions, email verification, client and freelancer profiles, demo sandboxing
3. Projects and proposals
4. Contracts, milestones and the simulated escrow ledger
5. Real-time messaging
6. Double-blind reviews and reputation
7. Search in Portuguese (full text, filters, facets)
8. Moderation and email notifications
9. One-click demo with simulated activity, end-to-end tests, final deploy

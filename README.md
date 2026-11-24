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
- **Projects and proposals.** Clients publish fixed-price projects with a budget range; freelancers
  answer with a proposal split into milestones (its price is their sum), and can change or withdraw it
  while it's open. The client compares them and hires one, which creates the contract.
- **Contracts paid by milestone (simulated escrow).** The client deposits each milestone before it
  starts; the money waits in escrow until the client approves the delivery (or asks for a revision, at
  most twice, or disputes it). A delivery the client lets sit for 7 days pays itself. Disputes go to an
  admin, who releases or refunds. The freelancer's wallet shows what they received, minus the 10% fee.
- **Messages in real time.** Client and freelancer talk about a project from the first proposal (or
  a client's invitation): live delivery, "typing…", unread counts and read receipts. Before a contract,
  contact details (phone, email, WhatsApp…) get a warning about leaving the platform's protection.
- **Double-blind reviews.** After a contract with a paid milestone, each side reviews the other once,
  within 14 days. Neither sees the other's review until both wrote or the 14 days are over, so nobody
  rates in retaliation. Reputation counts revealed reviews only.
- **Search in Portuguese.** Projects and freelancers are found by words typed with or without accents
  ("programacao" finds "programação"), in any form of the word ("lojas" finds "loja"), with filters
  (category, skills, budget, rating, availability), a count beside each filter, and freelancers ranked by
  relevance × a Bayesian rating, so one perfect review doesn't beat fifty very good ones.
- **Seeded marketplace.** Twelve freelancers, five clients, eight open projects and a review history,
  all fictional, so the market isn't empty.

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
- **State changes** are conditional updates (`UPDATE … WHERE status IN (…)`; no row changed means
  someone got there first, a 409). Hiring is one transaction that locks the project, accepts the proposal
  at the version the client saw, declines the rest and creates the contract; one contract per project is
  also a unique index. Tests race two acceptances, and acceptance against withdrawal.
- **The ledger** is double-entry, in integer centavos, and the database enforces it: entries add up to
  zero per transaction (a deferred constraint trigger, checked at commit), are append-only, keep each
  account's cached balance by trigger, never take an account below zero (except the outside world),
  and never cross sandboxes; a unique index allows one fund, release or refund per milestone. Every
  milestone action locks the contract first and posts in the same transaction. A reconciliation query
  checks it all against the milestones' states; a property test runs random concurrent action
  sequences and requires it to come back empty. Money-moving requests take an `Idempotency-Key`.
- **Real time with writes over REST.** Messages are written over REST: the conversation's counter
  numbers them with no gaps (its row lock orders senders), and the browser's id makes a resend
  harmless. Only after commit are they pushed over a WebSocket that never takes writes (except
  "typing"). The socket opens with a one-time ticket from the same-origin API, because in production it
  goes straight to the API's host; every reconnection refetches what may have been missed.
- **Double-blind as a query condition.** A review is visible when both sides wrote or the window closed:
  a condition in every query (lists and averages alike), not a flag a job flips, so time passing
  changes nothing in the database and nothing can be revealed twice or missed. Reviews can't be edited
  (a trigger allows only moderation's hidden flag), and a person's numbers count only reviews from their
  own corner of the marketplace, so demo visitors never move a seeded freelancer's rating.
- **Search is Postgres full text.** A `pt_unaccent` configuration (Portuguese stemming after stripping
  accents) feeds generated, weighted `tsvector` columns (title over skills over description) with GIN
  indexes; queries read as a web search (`"exact phrase"`, `-word`). The facets come from one query over
  the same matching rows: categories counted as if none were picked, skills within the results. Orders
  by a stored column (date, price) page by keyset; orders by a computed score (relevance, rating) page by
  offset, capped at ten pages. The reputation in the ranking is the same SQL the profile pages use, with
  the same reveal and sandbox rules.
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
3. ✅ Projects and proposals
4. ✅ Contracts, milestones and the simulated escrow ledger
5. ✅ Real-time messaging
6. ✅ Double-blind reviews and reputation
7. ✅ Search in Portuguese (full text, filters, facets)
8. Moderation and email notifications
9. One-click demo with simulated activity, end-to-end tests, final deploy

# 1. One sandbox rule for demo isolation

**Status:** accepted

## Context

The public demo lets anyone act as a client, a freelancer or an admin, with no sign-up. Visitors must see
a lively, shared marketplace, but never each other's projects, messages, money or reports, and nothing a
visitor does may change what the next visitor (or a real user) sees.

## Decision

- Every row a person writes carries a `sandboxId` (null for the seeded marketplace and real accounts).
- Every read goes through one rule, `visibleTo(viewer)`: rows with no sandbox, plus the viewer's own.
  Hand-written SQL (search, reputation) uses the same rule through `visibleToSql`.
- Seeded people act inside a visitor's sandbox as themselves (`{ id: seeded, sandboxId: visitor's }`), so
  what they write for that visitor (proposals, replies) carries the visitor's sandbox.
- Reputation counts only reviews from the reviewee's own corner: a visitor's 1-star review of a seeded
  freelancer stays in the visitor's sandbox and never moves the shared average.
- Admins act only on their own corner: a demo's admin moderates and decides disputes in that demo only.
- A sandbox lives 24 hours; removing it removes everything written in it in one transaction (the ledger
  and audit log, which otherwise refuse deletes, are purged under a transaction-local setting).

## Consequences

- One condition to review, test and mutate (tests remove it and expect failures per module).
- Indexes lead with `sandboxId` where lists are filtered by it.
- Limits keep the demo cheap: five new demos per address an hour, 200 alive at once, 60 writes a minute
  per demo.

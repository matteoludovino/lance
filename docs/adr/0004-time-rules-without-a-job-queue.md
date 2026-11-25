# 4. Time rules without a job queue

**Status:** accepted

## Context

Several rules depend on time: a delivery pays itself after 7 days, reviews are revealed after 14, an
unread message becomes an email after 10 minutes, a demo disappears after a day. The API runs as one
free instance that sleeps when idle; there is no Redis and no external scheduler.

## Decision

- Each rule is a due time stored with the data (`releaseDueAt`, `completedAt`, `pending_digests.dueAt`,
  `sandboxes.expiresAt`) and an idempotent sweep that re-checks the condition under a lock.
- Side effects go through a transactional outbox, written in the same transaction as the change and
  handled once (claimed with `FOR UPDATE SKIP LOCKED` and a lease, retried with backoff).
- One in-process scheduler runs every sweep on start, when new work is written (`kick`), and when the
  next item is due (at most five minutes away), repeating until a pass finds nothing.
- Rules that must hold even while the server sleeps are also applied when the data is read (a contract
  page releases what is overdue first) or are query conditions (a review is revealed when both wrote or
  the window closed — nothing to update when time passes).

## Consequences

- Tests drive time with a fake clock and run the sweeps by hand; nothing waits on real time.
- A sleeping server catches up on wake-up; nothing happens twice, because every sweep re-checks.

# 3. One rule for state transitions

**Status:** accepted

## Context

Projects, proposals and milestones change state from several directions at once: a client approves while
the delivery's deadline passes, both sides cancel, two proposals are accepted together.

## Decision

- Every transition is a conditional update: `UPDATE … SET status = :to WHERE id = :id AND status IN (:from)`.
  Zero rows changed means someone got there first: a 409 with a clear message (`expectChanged`).
- Milestone actions first lock their contract (`SELECT … FOR UPDATE`), always in the same order (contract,
  then ledger accounts by id), and post the money in the same transaction as the state change.
- Serialization failures and deadlocks (`40001`, `40P01`) retry the whole transaction a few times.
- Retried requests that move money carry an `Idempotency-Key`; a replay returns the first answer, a
  different body with the same key is a 422.

## Consequences

- Races are tested with real PostgreSQL: approval against automatic release against revision against
  dispute; two acceptances; two final milestones ending together (the contract still completes once).
- Code reads as "try the transition; if it didn't happen, say why", with no read-then-write windows.

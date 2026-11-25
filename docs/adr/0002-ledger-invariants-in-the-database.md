# 2. Ledger invariants enforced by the database

**Status:** accepted

## Context

Payments are simulated, but the escrow has to behave like a real one: a milestone's money is held until
it is approved, refunded or released, the platform fee is exact, and no bug may create or lose money.

## Decision

- Double-entry, in integer centavos (`bigint`). Accounts: the outside world, one escrow per milestone,
  a wallet per freelancer, the platform's revenue, all per sandbox.
- The database enforces, independently of the application:
  - entries of a transaction add up to zero (deferred constraint trigger, checked at commit);
  - entries and transactions are append-only (UPDATE/DELETE/TRUNCATE raise, except under
    `lance.ledger_purge`, used only to remove a whole demo sandbox);
  - cached balances are kept by trigger, and no account but the outside world goes negative;
  - a transaction never crosses sandboxes;
  - `UNIQUE (milestoneId, kind)`: at most one fund, one release and one refund per milestone.
- Fees round down; `fee + payout == amount` for every amount (property-tested).
- `reconcile()` checks balances against entries and escrow against milestone states; it runs in tests,
  in CI and on the admin's page.

## Consequences

- A wrong code path fails loudly at commit instead of corrupting balances; mutation tests that remove
  each trigger or the unique index make the suite fail.
- Correcting a mistake means a new, reversing transaction, never an edit.

import { Injectable } from "@nestjs/common";
import { uuidv7 } from "../common/ids.ts";
import type { LedgerTransactionKind } from "../generated/prisma/client.ts";
import type { Tx } from "../outbox/outbox.service.ts";
import { Clock } from "../time/clock.ts";

export type AccountRef =
  | { kind: "external" }
  | { kind: "revenue" }
  | { kind: "escrow"; milestoneId: string }
  | { kind: "wallet"; userId: string };

export interface Move {
  account: AccountRef;
  /** Positive credits the account, negative debits it. */
  amountCents: bigint;
}

/** The fee is rounded down; the freelancer gets the rest, so fee + payout is always the amount. */
export function splitFee(amountCents: bigint, feeBps: number): { feeCents: bigint; payoutCents: bigint } {
  const feeCents = (amountCents * BigInt(feeBps)) / 10_000n;
  return { feeCents, payoutCents: amountCents - feeCents };
}

function scopeKey(ref: AccountRef, sandboxId: string | null): string {
  const sandbox = sandboxId ?? "real";
  switch (ref.kind) {
    case "external":
      return `external:${sandbox}`;
    case "revenue":
      return `revenue:${sandbox}`;
    case "escrow":
      return `escrow:${ref.milestoneId}`;
    case "wallet":
      return `wallet:${ref.userId}:${sandbox}`;
  }
}

/**
 * The only writer of the ledger. A posting is one transaction of entries that add up to zero, in the
 * caller's database transaction; the database checks the sum at commit, keeps balances, refuses
 * negative ones, and refuses a second movement of the same kind for a milestone.
 */
@Injectable()
export class Ledger {
  constructor(private readonly clock: Clock) {}

  async post(
    tx: Tx,
    posting: { kind: LedgerTransactionKind; milestoneId: string; sandboxId: string | null; moves: Move[] },
  ): Promise<string> {
    const now = this.clock.now();
    const moves = posting.moves.filter((move) => move.amountCents !== 0n);
    const accounts = await Promise.all(
      moves.map((move) => this.account(tx, move.account, posting.sandboxId)),
    );
    const id = uuidv7(now.getTime());
    await tx.ledgerTransaction.create({
      data: {
        id,
        kind: posting.kind,
        milestoneId: posting.milestoneId,
        sandboxId: posting.sandboxId,
        createdAt: now,
      },
    });
    // Entries in account-id order: the balance trigger locks accounts in that order, the same in every
    // transaction, so two postings never wait on each other in a circle.
    const entries = moves
      .map((move, index) => ({
        transactionId: id,
        accountId: accounts[index]!,
        amountCents: move.amountCents,
      }))
      .sort((a, b) => (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0));
    await tx.ledgerEntry.createMany({ data: entries });
    return id;
  }

  /** The account's id, creating it on first use (safe when two transactions do it at once). */
  async account(tx: Tx, ref: AccountRef, sandboxId: string | null): Promise<string> {
    const key = scopeKey(ref, sandboxId);
    await tx.$executeRaw`
      INSERT INTO ledger_accounts (id, "scopeKey", kind, "sandboxId", "userId", "milestoneId", "createdAt")
      VALUES (${uuidv7()}::uuid, ${key}, ${ref.kind}::"LedgerAccountKind", ${sandboxId}::uuid,
              ${ref.kind === "wallet" ? ref.userId : null}::uuid,
              ${ref.kind === "escrow" ? ref.milestoneId : null}::uuid, ${this.clock.now()})
      ON CONFLICT ("scopeKey") DO NOTHING`;
    const account = await tx.ledgerAccount.findUniqueOrThrow({
      where: { scopeKey: key },
      select: { id: true },
    });
    return account.id;
  }

  async balance(tx: Tx, ref: AccountRef, sandboxId: string | null): Promise<bigint> {
    const account = await tx.ledgerAccount.findUnique({ where: { scopeKey: scopeKey(ref, sandboxId) } });
    return account?.balanceCents ?? 0n;
  }
}

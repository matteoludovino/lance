import fc from "fast-check";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Ledger, splitFee } from "../src/ledger/ledger.service.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { hire, resetDb, testApp } from "./support.ts";

const app = await testApp({}, { clock: new FakeClock() });
const db = app.get(PrismaService);
const ledger = app.get(Ledger);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

/** A milestone to post against (from a real contract), R$ 2.500. */
async function milestone() {
  const { milestones } = await hire(app);
  return milestones[0]!;
}

const fund = (milestoneId: string, escrow = 250_000n) => ({
  kind: "fund" as const,
  milestoneId,
  sandboxId: null,
  moves: [
    { account: { kind: "external" as const }, amountCents: -250_000n },
    { account: { kind: "escrow" as const, milestoneId }, amountCents: escrow },
  ],
});

describe("the database keeps the ledger honest", () => {
  it("refuses a transaction that doesn't add up to zero, at commit", async () => {
    const id = await milestone();
    await expect(db.$transaction((tx) => ledger.post(tx, fund(id, 240_000n)))).rejects.toThrow(
      /does not balance/,
    );
    expect(await db.ledgerTransaction.count()).toBe(0);
    // Everything rolled back, the accounts it created included.
    expect(await db.ledgerAccount.count()).toBe(0);
  });

  it("refuses a transaction with a single entry", async () => {
    const id = await milestone();
    await expect(
      db.$transaction((tx) =>
        ledger.post(tx, { kind: "fund", milestoneId: id, sandboxId: null, moves: [fund(id).moves[1]!] }),
      ),
    ).rejects.toThrow(/does not balance/);
  });

  it("refuses to take an account below zero (except the outside world)", async () => {
    const id = await milestone();
    const release = {
      kind: "release" as const,
      milestoneId: id,
      sandboxId: null,
      moves: [
        { account: { kind: "escrow" as const, milestoneId: id }, amountCents: -250_000n },
        { account: { kind: "revenue" as const }, amountCents: 250_000n },
      ],
    };
    await expect(db.$transaction((tx) => ledger.post(tx, release))).rejects.toThrow(
      /ledger_accounts_not_negative/,
    );
  });

  it("records one movement of each kind per milestone", async () => {
    const id = await milestone();
    await db.$transaction((tx) => ledger.post(tx, fund(id)));
    await expect(db.$transaction((tx) => ledger.post(tx, fund(id)))).rejects.toThrow(/Unique constraint/);
    expect(await db.ledgerTransaction.count()).toBe(1);
  });

  it("is append-only", async () => {
    const id = await milestone();
    await db.$transaction((tx) => ledger.post(tx, fund(id)));
    await expect(db.$executeRaw`UPDATE ledger_entries SET "amountCents" = 1`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM ledger_entries`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM ledger_transactions`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`TRUNCATE ledger_entries CASCADE`).rejects.toThrow(/append-only/);
    expect(await db.ledgerEntry.count()).toBe(2);
  });

  it("never mixes sandboxes in one transaction", async () => {
    const id = await milestone();
    const sandbox = await app.get(Sandboxes).create();
    await expect(
      db.$transaction(async (tx) => {
        const transactionId = "01a20000-0000-7000-8000-000000000001";
        await tx.ledgerTransaction.create({
          data: { id: transactionId, kind: "fund", milestoneId: id, sandboxId: null },
        });
        await tx.ledgerEntry.createMany({
          data: [
            {
              transactionId,
              accountId: await ledger.account(tx, { kind: "external" }, sandbox),
              amountCents: -5n,
            },
            {
              transactionId,
              accountId: await ledger.account(tx, { kind: "escrow", milestoneId: id }, null),
              amountCents: 5n,
            },
          ],
        });
      }),
    ).rejects.toThrow(/another sandbox/);
  });

  it("keeps cached balances equal to the entries, by trigger", async () => {
    const id = await milestone();
    await db.$transaction((tx) => ledger.post(tx, fund(id)));
    const balances = await db.ledgerAccount.findMany({ select: { kind: true, balanceCents: true } });
    expect(balances.sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: "escrow", balanceCents: 250_000n },
      { kind: "external", balanceCents: -250_000n },
    ]);
  });
});

describe("the fee", () => {
  it("is rounded down, and fee + payout is always the amount", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 100_000_000n }),
        fc.integer({ min: 0, max: 10_000 }),
        (amount, bps) => {
          const { feeCents, payoutCents } = splitFee(amount, bps);
          expect(feeCents + payoutCents).toBe(amount);
          expect(feeCents * 10_000n <= amount * BigInt(bps)).toBe(true);
          expect((feeCents + 1n) * 10_000n > amount * BigInt(bps)).toBe(true);
        },
      ),
    );
    expect(splitFee(12_345n, 1000)).toEqual({ feeCents: 1_234n, payoutCents: 11_111n });
  });
});

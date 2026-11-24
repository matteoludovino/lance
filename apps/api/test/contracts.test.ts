import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ContractSummary, ContractView, WalletView } from "@lance/shared";
import { reconcile } from "../src/ledger/reconciliation.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { Milestones } from "../src/contracts/milestones.service.ts";
import { Scheduler } from "../src/scheduler/scheduler.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { Browser, admin, directUser, emailsTo, hire, resetDb, testApp } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
const scheduler = app.get(Scheduler);
/** The auto-release sweep alone (runOnce also counts outbox events). */
const releaseDue = () => app.get(Milestones).releaseDue(clock.now());
afterAll(() => app.close());
beforeEach(() => resetDb(db));

const HOUR = 3_600_000;
const NOTE = { note: "Tema instalado e catálogo com 40 produtos." };

async function contract(browser: Browser, id: string): Promise<ContractView> {
  const response = await browser.get(`/api/contracts/${id}`);
  expect(response.statusCode, response.body).toBe(200);
  return response.json();
}

const status = async (browser: Browser, contractId: string) =>
  (await contract(browser, contractId)).milestones.map((m) => m.status);

async function balances() {
  const accounts = await db.ledgerAccount.findMany();
  const of = (kind: string) =>
    accounts.filter((a) => a.kind === kind).reduce((sum, a) => sum + Number(a.balanceCents), 0);
  return { external: of("external"), escrow: of("escrow"), wallet: of("wallet"), revenue: of("revenue") };
}

async function expectReconciled() {
  expect(await reconcile(db)).toEqual([]);
}

describe("the milestone lifecycle", () => {
  it("funds, delivers and approves, paying the freelancer minus the fee, then completes", async () => {
    const { client, freelancer, contractId, projectId, milestones } = await hire(app);
    const [first, second] = milestones as [string, string];

    expect((await client.browser.post(`/api/milestones/${first}/fund`)).json()).toEqual({
      milestoneId: first,
      status: "funded",
    });
    expect(await balances()).toEqual({ external: -250_000, escrow: 250_000, wallet: 0, revenue: 0 });
    await expectReconciled();

    await freelancer.browser.post(`/api/milestones/${first}/submit`, NOTE);
    const delivered = await contract(client.browser, contractId);
    expect(delivered.milestones[0]).toMatchObject({
      status: "submitted",
      deliveryNote: NOTE.note,
      releaseDueAt: new Date(clock.now().getTime() + 168 * HOUR).toISOString(),
      feeCents: 25_000,
      payoutCents: 225_000,
    });

    await client.browser.post(`/api/milestones/${first}/approve`);
    expect(await balances()).toEqual({ external: -250_000, escrow: 0, wallet: 225_000, revenue: 25_000 });
    expect((await contract(client.browser, contractId)).status).toBe("active");

    await client.browser.post(`/api/milestones/${second}/fund`);
    await freelancer.browser.post(`/api/milestones/${second}/submit`, NOTE);
    await client.browser.post(`/api/milestones/${second}/approve`);
    const done = await contract(freelancer.browser, contractId);
    expect(done).toMatchObject({
      status: "completed",
      role: "freelancer",
      totals: { heldCents: 0, releasedCents: 450_000, refundedCents: 0 },
    });
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe("completed");
    expect((await freelancer.browser.get("/api/me/wallet")).json() as WalletView).toMatchObject({
      balanceCents: 405_000,
      entries: [{ amountCents: 180_000 }, { amountCents: 225_000 }],
    });
    await expectReconciled();

    const freelancerEmail = (await db.user.findUniqueOrThrow({ where: { id: freelancer.id } })).email;
    // Same fake instant for all of them: compare without order.
    expect((await emailsTo(app, freelancerEmail)).map((e) => e.kind).sort()).toEqual([
      "milestone_approved",
      "milestone_approved",
      "milestone_funded",
      "milestone_funded",
      "proposal_accepted",
    ]);
  });

  it("lets each side do only its own part", async () => {
    const { client, freelancer, milestones } = await hire(app);
    const [first] = milestones as [string];
    expect((await freelancer.browser.post(`/api/milestones/${first}/fund`)).statusCode).toBe(403);
    await client.browser.post(`/api/milestones/${first}/fund`);
    expect((await client.browser.post(`/api/milestones/${first}/submit`, NOTE)).statusCode).toBe(403);
    const stranger = await directUser(app);
    expect(
      (await stranger.browser.post(`/api/milestones/${first}/dispute`, { reason: "x".repeat(30) }))
        .statusCode,
    ).toBe(404);
    expect(
      (await stranger.browser.get(`/api/contracts/${(await db.contract.findFirstOrThrow()).id}`)).statusCode,
    ).toBe(404);
  });

  it("allows two revisions, then only approval or a dispute", async () => {
    const { client, freelancer, contractId, milestones } = await hire(app);
    const [first] = milestones as [string];
    await client.browser.post(`/api/milestones/${first}/fund`);
    for (let round = 0; round < 2; round++) {
      await freelancer.browser.post(`/api/milestones/${first}/submit`, NOTE);
      const asked = await client.browser.post(`/api/milestones/${first}/request-revision`, {
        note: "Faltou o frete por CEP no checkout.",
      });
      expect(asked.json().status).toBe("revision_requested");
    }
    await freelancer.browser.post(`/api/milestones/${first}/submit`, NOTE);
    const third = await client.browser.post(`/api/milestones/${first}/request-revision`, {
      note: "Ainda faltou o frete por CEP.",
    });
    expect(third.statusCode).toBe(409);
    expect(third.json().error.code).toBe("revisions_exhausted");
    expect((await contract(client.browser, contractId)).milestones[0]).toMatchObject({
      status: "submitted",
      revisionsLeft: 0,
    });
    await expectReconciled();
  });

  it("cancels alone only before a delivery; a contract with nothing paid ends cancelled", async () => {
    const { client, freelancer, contractId, projectId, milestones } = await hire(app);
    const [first, second] = milestones as [string, string];
    await client.browser.post(`/api/milestones/${first}/fund`);
    await client.browser.post(`/api/milestones/${second}/fund`);
    await freelancer.browser.post(`/api/milestones/${second}/submit`, NOTE);

    const late = await client.browser.post(`/api/milestones/${second}/cancel`);
    expect(late.json().error.code).toBe("not_cancellable");
    expect((await freelancer.browser.post(`/api/milestones/${first}/cancel`)).json().status).toBe("refunded");
    expect(await balances()).toMatchObject({ external: -200_000, escrow: 200_000 });

    await client.browser.post(`/api/milestones/${second}/dispute`, {
      reason: "A entrega não corresponde ao combinado.",
    });
    const boss = await admin(app);
    await boss.browser.post(`/api/admin/milestones/${second}/resolve`, { outcome: "refund" });
    expect(await balances()).toEqual({ external: 0, escrow: 0, wallet: 0, revenue: 0 });
    expect((await contract(client.browser, contractId)).status).toBe("cancelled");
    expect((await db.project.findUniqueOrThrow({ where: { id: projectId } })).status).toBe("cancelled");
    await expectReconciled();
  });
});

describe("automatic release", () => {
  it("pays a delivery the client lets pass the due time, on the next read or sweep", async () => {
    const { client, freelancer, contractId, milestones } = await hire(app);
    const [first, second] = milestones as [string, string];
    for (const id of [first, second]) {
      await client.browser.post(`/api/milestones/${id}/fund`);
      await freelancer.browser.post(`/api/milestones/${id}/submit`, NOTE);
    }
    clock.advance(167 * HOUR);
    await scheduler.runOnce();
    expect(await status(client.browser, contractId)).toEqual(["submitted", "submitted"]);

    clock.advance(2 * HOUR);
    // Reading the contract pays what is due first…
    expect(await status(freelancer.browser, contractId)).toEqual(["released", "released"]);
    expect((await contract(client.browser, contractId)).status).toBe("completed");
    // …and a sweep afterwards finds nothing left to do: paid exactly once.
    expect(await releaseDue()).toBe(0);
    expect(await db.ledgerTransaction.count({ where: { kind: "release" } })).toBe(2);
    await expectReconciled();
  });

  it("is stopped by a dispute; an admin decides", async () => {
    const { client, freelancer, contractId, milestones } = await hire(app);
    const [first] = milestones as [string];
    await client.browser.post(`/api/milestones/${first}/fund`);
    await freelancer.browser.post(`/api/milestones/${first}/submit`, NOTE);
    await client.browser.post(`/api/milestones/${first}/dispute`, {
      reason: "A loja não aceita Pix como combinado.",
    });
    clock.advance(500 * HOUR);
    await scheduler.runOnce();
    const view = await contract(freelancer.browser, contractId);
    expect(view.milestones[0]).toMatchObject({
      status: "disputed",
      releaseDueAt: null,
      dispute: { by: "client", reason: "A loja não aceita Pix como combinado." },
    });

    expect(
      (await client.browser.post(`/api/admin/milestones/${first}/resolve`, { outcome: "release" }))
        .statusCode,
    ).toBe(403);
    const boss = await admin(app);
    expect(
      (await boss.browser.post(`/api/admin/milestones/${first}/resolve`, { outcome: "release" })).json()
        .status,
    ).toBe("released");
    expect(await balances()).toMatchObject({ wallet: 225_000, revenue: 25_000, escrow: 0 });
    expect((await boss.browser.get("/api/admin/reconciliation")).json()).toEqual({ ok: true, problems: [] });
  });
});

describe("races", () => {
  it("approval, automatic release, revision and dispute at once: exactly one happens", async () => {
    for (let round = 0; round < 6; round++) {
      await resetDb(db);
      const { client, freelancer, milestones } = await hire(app);
      const [first] = milestones as [string];
      await client.browser.post(`/api/milestones/${first}/fund`);
      await freelancer.browser.post(`/api/milestones/${first}/submit`, NOTE);
      clock.advance(200 * HOUR);
      const answers = await Promise.all([
        client.browser.post(`/api/milestones/${first}/approve`),
        releaseDue(),
        client.browser.post(`/api/milestones/${first}/request-revision`, { note: "Faltou o frete por CEP." }),
        freelancer.browser.post(`/api/milestones/${first}/dispute`, {
          reason: "O cliente não responde há dias.",
        }),
      ]);
      const succeeded = answers.filter((a) => (typeof a === "number" ? a === 1 : a.statusCode === 200));
      expect(succeeded).toHaveLength(1);
      expect(
        await db.ledgerTransaction.count({ where: { kind: { in: ["release", "refund"] } } }),
      ).toBeLessThanOrEqual(1);
      await expectReconciled();
    }
  });

  it("two milestones finishing at once still complete the contract", async () => {
    for (let round = 0; round < 8; round++) {
      await resetDb(db);
      const { client, freelancer, contractId, milestones } = await hire(app);
      for (const id of milestones) {
        await client.browser.post(`/api/milestones/${id}/fund`);
        await freelancer.browser.post(`/api/milestones/${id}/submit`, NOTE);
      }
      await Promise.all(milestones.map((id) => client.browser.post(`/api/milestones/${id}/approve`)));
      expect((await db.contract.findUniqueOrThrow({ where: { id: contractId } })).status).toBe("completed");
    }
  });
});

describe("settling a contract", () => {
  it("happens even when its last two milestones end at the same moment without any money", async () => {
    // Nothing shared in the ledger serializes these two: only the contract lock does.
    for (let round = 0; round < 8; round++) {
      await resetDb(db);
      const { client, freelancer, contractId, milestones } = await hire(app);
      const [first, second] = milestones as [string, string];
      await Promise.all([
        client.browser.post(`/api/milestones/${first}/cancel`),
        freelancer.browser.post(`/api/milestones/${second}/cancel`),
      ]);
      expect((await db.contract.findUniqueOrThrow({ where: { id: contractId } })).status).toBe("cancelled");
    }
  });
});

describe("retry keys", () => {
  it("give the first answer again, move the money once, and refuse reuse for another request", async () => {
    const { client, milestones } = await hire(app);
    const [first, second] = milestones as [string, string];
    const fund = (id: string, key?: string) =>
      app.inject({
        method: "POST",
        url: `/api/milestones/${id}/fund`,
        remoteAddress: client.browser.ip,
        headers: {
          origin: "http://localhost:3030",
          cookie: `lance_session=${client.browser.cookie}`,
          ...(key ? { "idempotency-key": key } : {}),
        },
      });

    const answers = await Promise.all([fund(first, "fund-first-abc"), fund(first, "fund-first-abc")]);
    expect(answers.map((a) => a.statusCode)).toEqual([200, 200]);
    expect(answers[0]!.json()).toEqual(answers[1]!.json());
    expect((await fund(first, "fund-first-abc")).json()).toEqual({ milestoneId: first, status: "funded" });
    expect(await db.ledgerTransaction.count({ where: { kind: "fund" } })).toBe(1);

    const reused = await fund(second, "fund-first-abc");
    expect(reused.statusCode).toBe(422);
    expect(reused.json().error.code).toBe("idempotency_key_reused");
    // Without a key, a repeat is just a conflict.
    expect((await fund(first)).statusCode).toBe(409);
    expect((await fund(first, "bad key!")).statusCode).toBe(400);
  });
});

describe("demo isolation", () => {
  it("keeps contracts, admins and money inside the sandbox", async () => {
    const sandbox = await app.get(Sandboxes).create();
    const { client, contractId, milestones } = await hire(app, { sandboxId: sandbox });
    const [first] = milestones as [string];
    await client.browser.post(`/api/milestones/${first}/fund`);
    const accounts = await db.ledgerAccount.findMany();
    expect(accounts.every((a) => a.sandboxId === sandbox)).toBe(true);

    const realAdmin = await admin(app);
    expect((await realAdmin.browser.get(`/api/contracts/${contractId}`)).statusCode).toBe(404);
    const sandboxAdmin = await admin(app, sandbox);
    expect((await contract(sandboxAdmin.browser, contractId)).role).toBe("admin");
    expect(((await client.browser.get("/api/me/contracts")).json() as ContractSummary[])[0]).toMatchObject({
      role: "client",
      waitingOnYou: 1,
    });
  });
});

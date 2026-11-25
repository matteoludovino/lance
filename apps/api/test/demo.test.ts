import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ContractSummary,
  DemoEmail,
  Me,
  ProjectResults,
  ProjectSummary,
  ProposalView,
} from "@lance/shared";
import { reconcile } from "../src/ledger/reconciliation.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { seedMarketplace } from "../src/seed/seed.ts";
import { Scheduler } from "../src/scheduler/scheduler.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { Browser, ORIGIN, resetDb, testApp } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb(db);
  await seedMarketplace(db);
});

const SECOND = 1000;
const run = () => app.get(Scheduler).runOnce();

async function enter(browser: Browser, persona: string): Promise<Me> {
  const response = await browser.post("/api/demo", { persona });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

async function sandboxOf(me: Me): Promise<string> {
  return (await db.user.findUniqueOrThrow({ where: { id: me.id } })).sandboxId!;
}

describe("one-click demo", () => {
  it("starts with three people, a contract under way and an open project; personas switch in place", async () => {
    const visitor = new Browser(app);
    const client = await enter(visitor, "client");
    expect(client).toMatchObject({ name: "Renata Alves", demo: true, role: "user", emailVerified: true });
    const sandbox = await sandboxOf(client);

    const [contract] = (await visitor.get("/api/me/contracts")).json() as ContractSummary[];
    expect(contract).toMatchObject({ status: "active" });
    const view = (await visitor.get(`/api/contracts/${contract!.id}`)).json();
    expect(view.milestones.map((m: { status: string }) => m.status)).toEqual([
      "submitted",
      "pending_funding",
    ]);
    const mine = (await visitor.get("/api/me/projects")).json() as ProjectSummary[];
    expect(mine.map((p) => p.status).sort()).toEqual(["in_progress", "open"]);
    expect(await reconcile(db)).toEqual([]);

    // Switching keeps the same demo; the previous session ends.
    const before = visitor.cookie;
    const freelancer = await enter(visitor, "freelancer");
    expect(freelancer).toMatchObject({ name: "Lívia Prado", demo: true });
    expect(await sandboxOf(freelancer)).toBe(sandbox);
    expect(visitor.cookie).not.toBe(before);
    const old = new Browser(app);
    old.cookie = before;
    expect((await old.get("/api/me")).statusCode).toBe(401);
    const admin = await enter(visitor, "admin");
    expect(admin.role).toBe("admin");
    expect((await visitor.get("/api/admin/disputes")).statusCode).toBe(200);
    expect(await db.sandbox.count()).toBe(1);
    expect(await db.user.count({ where: { sandboxId: sandbox } })).toBe(3);

    // Nobody else sees any of it.
    const stranger = new Browser(app);
    const market = (await stranger.get("/api/projects")).json() as ProjectResults;
    expect(market.items.some((p) => p.client.name === "Renata Alves")).toBe(false);
    expect((await stranger.post("/api/demo", { persona: "nobody" })).statusCode).toBe(400);
  });

  it("seeded freelancers answer the visitor's open project, a little later and only inside the demo", async () => {
    const visitor = new Browser(app);
    const me = await enter(visitor, "client");
    const sandbox = await sandboxOf(me);
    const open = ((await visitor.get("/api/me/projects")).json() as ProjectSummary[]).find(
      (p) => p.status === "open",
    )!;
    const proposals = async () =>
      (await visitor.get(`/api/projects/${open.id}/proposals`)).json() as ProposalView[];

    await run();
    expect(await proposals()).toEqual([]);
    clock.advance(16 * SECOND);
    await run();
    expect(await proposals()).toHaveLength(1);
    clock.advance(90 * SECOND);
    await run();
    const all = await proposals();
    expect(all).toHaveLength(3);
    // Those whose work fits the project come first: it's a writing project.
    expect(all.some((p) => p.freelancer.headline?.includes("Copywriter"))).toBe(true);
    for (const p of all) {
      expect(p.priceCents).toBeGreaterThanOrEqual(open.budgetMinCents);
      expect(p.priceCents).toBeLessThanOrEqual(open.budgetMaxCents);
    }
    expect(await db.proposal.count({ where: { projectId: open.id, sandboxId: { not: sandbox } } })).toBe(0);
    // The seeded people's own view of the marketplace doesn't change.
    expect(await db.proposal.count({ where: { sandboxId: null } })).toBe(0);
    // The visitor's inbox got the "new proposal" emails; the seeded people got none at all.
    const inbox = (await visitor.get("/api/demo/emails")).json() as DemoEmail[];
    expect(inbox.filter((e) => e.subject.startsWith("Nova proposta"))).toHaveLength(3);
    expect(await db.sentEmail.count({ where: { sandboxId: null } })).toBe(0);
  });

  it("seeded people answer messages a few times, then stop", async () => {
    const visitor = new Browser(app);
    await enter(visitor, "client");
    await run(); // the publication schedules the seeded freelancers…
    clock.advance(100 * SECOND);
    await run(); // …who answer
    const open = ((await visitor.get("/api/me/projects")).json() as ProjectSummary[]).find(
      (p) => p.status === "open",
    )!;
    const [proposal] = (await visitor.get(`/api/projects/${open.id}/proposals`)).json() as ProposalView[];
    const conversation = proposal!.conversationId!;
    const say = (body: string) =>
      visitor.post(`/api/conversations/${conversation}/messages`, { clientId: crypto.randomUUID(), body });
    const fromBot = async () =>
      db.message.count({ where: { conversationId: conversation, senderId: proposal!.freelancer.id } });

    for (let round = 1; round <= 4; round++) {
      await say(`Pergunta número ${round} sobre o projeto.`);
      await say("E mais uma coisa."); // two in a row: still one answer
      clock.advance(5 * SECOND);
      await run();
      expect(await fromBot()).toBe(round - 1);
      clock.advance(5 * SECOND);
      await run();
      expect(await fromBot()).toBe(Math.min(round, 3));
    }
    // The seeded person never reads: their unread-messages email is due, and goes nowhere (no inbox
    // to deliver to, and nothing kept that would outlive the demo).
    clock.advance(11 * 60 * SECOND);
    await run();
    expect(await db.pendingDigest.count()).toBe(0);
    expect(await db.sentEmail.count({ where: { sandboxId: null } })).toBe(0);
  });

  it("keeps each demo's inbox to itself", async () => {
    const first = new Browser(app);
    const second = new Browser(app);
    await enter(first, "client");
    await enter(second, "client");
    await run();
    const a = (await first.get("/api/demo/emails")).json() as DemoEmail[];
    const b = (await second.get("/api/demo/emails")).json() as DemoEmail[];
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((email) => email.to === "Renata Alves" || email.to === "Lívia Prado")).toBe(true);
    const theirs = new Set(b.map((e) => e.id));
    expect(a.filter((e) => theirs.has(e.id))).toEqual([]);
    expect((await new Browser(app).get("/api/demo/emails")).statusCode).toBe(401);
  });
});

describe("demo limits", () => {
  const fromAddress = (remoteAddress: string) =>
    app.inject({
      method: "POST",
      url: "/api/demo",
      remoteAddress,
      headers: { origin: ORIGIN },
      payload: { persona: "client" },
    });

  it("five new demos per address an hour", async () => {
    for (let n = 0; n < 5; n++) expect((await fromAddress("10.99.0.1")).statusCode).toBe(201);
    const sixth = await fromAddress("10.99.0.1");
    expect(sixth.statusCode).toBe(429);
    expect(sixth.headers["retry-after"]).toBeDefined();
    expect((await fromAddress("10.99.0.2")).statusCode).toBe(201);
    clock.advance(3_601 * SECOND);
    expect((await fromAddress("10.99.0.1")).statusCode).toBe(201);
  });

  it("a global cap on demos alive at once", async () => {
    const now = clock.now();
    await db.sandbox.createMany({
      data: Array.from({ length: 200 }, (_, n) => ({
        id: `01a20000-0000-7000-8000-${String(n).padStart(12, "0")}`,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
      })),
    });
    const full = await fromAddress("10.99.1.1");
    expect(full.statusCode).toBe(503);
    expect(full.json().error.code).toBe("demo_full");
    expect(full.headers["retry-after"]).toBe("300");
  });

  it("sixty writes a minute per demo, shared by its personas", async () => {
    const visitor = new Browser(app);
    await enter(visitor, "client"); // the start itself isn't a demo write yet
    const [contract] = (await visitor.get("/api/me/contracts")).json() as ContractSummary[];
    const conversations = (await visitor.get("/api/conversations")).json() as { id: string }[];
    const read = () => visitor.post(`/api/conversations/${conversations[0]!.id}/read`, { seq: 0 });
    for (let n = 0; n < 59; n++) expect((await read()).statusCode).toBeLessThan(300);
    await enter(visitor, "freelancer"); // switching counts as a write of this demo
    expect((await read()).statusCode).toBe(429);
    expect((await visitor.get(`/api/contracts/${contract!.id}`)).statusCode).toBe(200); // reading is free
    clock.advance(61 * SECOND);
    expect((await read()).statusCode).toBeLessThan(300);
  });
});

describe("demo expiry", () => {
  it("after a day removes everything the demo wrote, money and audit trail included, and nothing else", async () => {
    const seededBefore = {
      users: await db.user.count(),
      projects: await db.project.count(),
      reviews: await db.review.count(),
    };
    const visitor = new Browser(app);
    await enter(visitor, "client");
    const [contract] = (await visitor.get("/api/me/contracts")).json() as ContractSummary[];
    const { milestones } = (await visitor.get(`/api/contracts/${contract!.id}`)).json();
    await visitor.post(`/api/milestones/${milestones[0].id}/dispute`, {
      reason: "O layout não segue a identidade visual que mandei.",
    });
    await enter(visitor, "admin");
    await visitor.post(`/api/admin/milestones/${milestones[0].id}/resolve`, { outcome: "release" });
    clock.advance(100 * SECOND);
    await run(); // bots' proposals, emails
    const sandbox = (await db.sandbox.findFirstOrThrow()).id;
    expect(await db.ledgerEntry.count()).toBeGreaterThan(0);
    expect(await db.auditEntry.count({ where: { sandboxId: sandbox } })).toBe(1);
    expect(await reconcile(db)).toEqual([]);

    clock.advance(23 * 3_600_000);
    await run();
    expect(await db.sandbox.count()).toBe(1);
    clock.advance(1 * 3_600_000);
    await run();

    expect(await db.sandbox.count()).toBe(0);
    for (const count of [
      db.user.count({ where: { sandboxId: { not: null } } }),
      db.project.count({ where: { sandboxId: { not: null } } }),
      db.proposal.count(),
      db.contract.count(),
      db.conversation.count(),
      db.message.count(),
      db.ledgerEntry.count(),
      db.ledgerTransaction.count(),
      db.ledgerAccount.count(),
      db.auditEntry.count(),
      db.sentEmail.count(),
      db.outboxEvent.count(),
      db.session.count(),
    ])
      expect(await count).toBe(0);
    expect({
      users: await db.user.count(),
      projects: await db.project.count(),
      reviews: await db.review.count(),
    }).toEqual(seededBefore);
    expect((await visitor.get("/api/me")).statusCode).toBe(401);
  });
});

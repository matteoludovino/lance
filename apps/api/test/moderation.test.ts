import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AuditEntryView, DisputeView, ProjectResults, ReportDetail, ReportView } from "@lance/shared";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import {
  Browser,
  admin,
  emailsTo,
  hire,
  person,
  publishProject,
  resetDb,
  sendProposal,
  testApp,
} from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

type Someone = Awaited<ReturnType<typeof person>>;

const report = (who: Someone, targetType: string, targetId: string, reason = "spam", details = "") =>
  who.browser.post("/api/reports", { targetType, targetId, reason, details });
const queue = async (who: Someone, status = "open") =>
  (await who.browser.get(`/api/admin/reports?status=${status}`)).json() as ReportView[];
const decide = (who: Someone, id: string, action: string, note = "") =>
  who.browser.post(`/api/admin/reports/${id}/resolve`, { action, note });
const audit = async (who: Someone) => (await who.browser.get("/api/admin/audit")).json() as AuditEntryView[];
const emailOf = async (who: Someone) => (await db.user.findUniqueOrThrow({ where: { id: who.id } })).email;

/** A client's project with a freelancer's proposal: the two have a conversation. */
async function talking() {
  const client = await person(app, ["client"], { name: "Helena Duarte" });
  const freelancer = await person(app, ["freelancer"], { name: "Marina Costa" });
  const project = await publishProject(client);
  await sendProposal(freelancer, project.id);
  const conversation = await db.conversation.findFirstOrThrow({ where: { projectId: project.id } });
  return { client, freelancer, project, conversationId: conversation.id };
}

async function say(who: Someone, conversationId: string, body: string) {
  const response = await who.browser.post(`/api/conversations/${conversationId}/messages`, {
    clientId: crypto.randomUUID(),
    body,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json().message as { id: string };
}

describe("reports", () => {
  it("are about what the reporter can see, never their own, one per person and thing", async () => {
    const { client, freelancer, project, conversationId } = await talking();
    expect(
      (await report(freelancer, "project", project.id, "fraud", "Pede pagamento por fora.")).statusCode,
    ).toBe(201);
    expect((await report(freelancer, "project", project.id)).json().error.code).toBe("already_reported");
    expect((await report(client, "project", project.id)).json().error.code).toBe("own_content");
    expect(
      (
        await new Browser(app).post("/api/reports", {
          targetType: "project",
          targetId: project.id,
          reason: "spam",
        })
      ).statusCode,
    ).toBe(401);
    expect((await report(freelancer, "project", project.id, "boring")).statusCode).toBe(400);

    // Someone else's conversation, or a demo visitor's corner: as if it didn't exist.
    const message = await say(client, conversationId, "Pode começar na segunda-feira?");
    const stranger = await person(app, ["freelancer"]);
    expect((await report(stranger, "message", message.id)).statusCode).toBe(404);
    expect((await report(freelancer, "message", message.id, "offensive")).statusCode).toBe(201);
    const sandbox = await app.get(Sandboxes).create();
    const visitor = await person(app, ["client"], { sandboxId: sandbox });
    const theirs = await publishProject(visitor);
    expect((await report(stranger, "project", theirs.id)).statusCode).toBe(404);
    expect((await report(stranger, "profile", visitor.id)).statusCode).toBe(404);
  });

  it("reach the queue on their own for contact details before a contract, and opening one is audited", async () => {
    const { freelancer, conversationId } = await talking();
    const moderator = await admin(app);
    await say(freelancer, conversationId, "Me chama no WhatsApp: (11) 98765-4321");

    const [flagged] = await queue(moderator);
    expect(flagged).toMatchObject({
      targetType: "message",
      reason: "off_platform",
      reporter: null,
      target: { author: { name: "Marina Costa", suspended: false }, hidden: false },
    });
    // The queue never shows a message's text…
    expect(JSON.stringify(flagged)).not.toContain("98765");
    expect(await audit(moderator)).toEqual([]);
    // …opening the report does, and leaves a trace.
    const detail = (await moderator.browser.get(`/api/admin/reports/${flagged!.id}`)).json() as ReportDetail;
    expect(detail.content).toContain("98765-4321");
    expect(detail.contactFlags.length).toBeGreaterThan(0);
    const [entry] = await audit(moderator);
    expect(entry).toMatchObject({
      action: "report.viewed",
      targetType: "message",
      actor: { id: moderator.id },
    });

    // Not admins: nothing.
    expect((await freelancer.browser.get("/api/admin/reports")).statusCode).toBe(403);
    expect((await freelancer.browser.get(`/api/admin/reports/${flagged!.id}`)).statusCode).toBe(403);
    expect((await freelancer.browser.get("/api/admin/audit")).statusCode).toBe(403);
  });
});

describe("moderation", () => {
  it("hides content from everyone (closing every report about it), tells its owner, and can undo", async () => {
    const { client, freelancer, project } = await talking();
    const other = await person(app, ["freelancer"]);
    const moderator = await admin(app);
    await report(freelancer, "project", project.id, "fraud");
    clock.advance(1000); // oldest first: the fraud report leads the queue
    await report(other, "project", project.id, "spam");
    const [first, second] = await queue(moderator);
    expect(first!.sameTarget).toBe(1);

    const decided = (await decide(moderator, first!.id, "hide", "Golpe conhecido.")).json() as ReportView;
    expect(decided).toMatchObject({ status: "actioned", resolution: "hidden", note: "Golpe conhecido." });
    expect(await queue(moderator)).toEqual([]);
    expect((await queue(moderator, "closed")).map((r) => r.id).sort()).toEqual(
      [first!.id, second!.id].sort(),
    );
    expect((await decide(moderator, second!.id, "dismiss")).json().error.code).toBe("already_resolved");

    const visitor = new Browser(app);
    expect((await visitor.get(`/api/projects/${project.id}`)).statusCode).toBe(404);
    expect(((await visitor.get("/api/projects")).json() as ProjectResults).total).toBe(0);
    const [notice] = (await emailsTo(app, await emailOf(client))).filter(
      (e) => e.kind === "moderation_hidden",
    );
    expect(notice!.text).toContain("Golpe ou fraude".toLowerCase());
    expect(notice!.text).not.toContain("Descadastrar");

    // Undo: back in the marketplace, both reports open again.
    clock.advance(1000);
    expect((await moderator.browser.post(`/api/admin/reports/${first!.id}/reopen`)).statusCode).toBe(200);
    expect((await visitor.get(`/api/projects/${project.id}`)).statusCode).toBe(200);
    expect(await queue(moderator)).toHaveLength(2);
    expect((await audit(moderator)).map((e) => e.action)).toEqual(["report.reopened", "report.hidden"]);
  });

  it("suspends an author: signed out everywhere, can't sign in, gone from listings", async () => {
    const { client, freelancer, project } = await talking();
    const moderator = await admin(app);
    await report(freelancer, "profile", client.id, "fraud");
    const [open] = await queue(moderator);
    expect((await decide(moderator, open!.id, "suspend")).json()).toMatchObject({
      resolution: "suspended",
      target: { author: { suspended: true } },
    });

    expect((await client.browser.get("/api/me")).statusCode).toBe(401);
    expect(await db.session.count({ where: { userId: client.id } })).toBe(0);
    const visitor = new Browser(app);
    expect((await visitor.get(`/api/clients/${client.id}`)).statusCode).toBe(404);
    expect((await visitor.get(`/api/projects/${project.id}`)).statusCode).toBe(404);
    expect((await emailsTo(app, await emailOf(client))).map((e) => e.kind)).toContain("moderation_suspended");

    await moderator.browser.post(`/api/admin/reports/${open!.id}/reopen`);
    expect((await visitor.get(`/api/clients/${client.id}`)).statusCode).toBe(200);
  });

  it("dismissing changes nothing but the report", async () => {
    const { freelancer, project } = await talking();
    const moderator = await admin(app);
    await report(freelancer, "project", project.id);
    const [open] = await queue(moderator);
    expect((await decide(moderator, open!.id, "dismiss")).json()).toMatchObject({ status: "dismissed" });
    expect((await new Browser(app).get(`/api/projects/${project.id}`)).statusCode).toBe(200);
  });

  it("stays in the admin's own corner of the marketplace", async () => {
    const sandbox = await app.get(Sandboxes).create();
    const demoAdmin = await admin(app, sandbox);
    const realAdmin = await admin(app);
    const visitor = await person(app, ["freelancer"], { sandboxId: sandbox });
    const seededClient = await person(app, ["client"]);
    const seeded = await publishProject(seededClient);
    const visitorClient = await person(app, ["client"], { sandboxId: sandbox });
    const theirs = await publishProject(visitorClient);
    await report(visitor, "project", seeded.id, "spam");
    await report(visitor, "project", theirs.id, "spam");

    // The visitor's reports are their sandbox's; the real queue doesn't see them.
    expect(await queue(realAdmin)).toEqual([]);
    const reports = await queue(demoAdmin);
    expect(reports).toHaveLength(2);
    const onSeeded = reports.find((r) => r.targetId === seeded.id)!;
    const onTheirs = reports.find((r) => r.targetId === theirs.id)!;
    // The demo's admin can't hide the shared showcase, only what was made in the demo.
    expect((await decide(demoAdmin, onSeeded.id, "hide")).json().error.code).toBe("outside_sandbox");
    expect((await decide(demoAdmin, onSeeded.id, "dismiss")).statusCode).toBe(200);
    expect((await decide(demoAdmin, onTheirs.id, "hide")).statusCode).toBe(200);
    expect((await new Browser(app).get(`/api/projects/${seeded.id}`)).statusCode).toBe(200);
    expect((await realAdmin.browser.get(`/api/admin/reports/${onTheirs.id}`)).statusCode).toBe(404);
    expect(await audit(realAdmin)).toEqual([]);
  });
});

describe("audit log", () => {
  it("records dispute decisions, and the database refuses to change it", async () => {
    const { client, freelancer, milestones } = await hire(app);
    const moderator = await admin(app);
    await client.browser.post(`/api/milestones/${milestones[0]}/fund`);
    await freelancer.browser.post(`/api/milestones/${milestones[0]}/submit`, {
      note: "Entrega feita conforme combinado.",
    });
    await client.browser.post(`/api/milestones/${milestones[0]}/dispute`, {
      reason: "A entrega não corresponde ao combinado na proposta.",
    });
    const [dispute] = (await moderator.browser.get("/api/admin/disputes")).json() as DisputeView[];
    expect(dispute).toMatchObject({
      milestoneId: milestones[0],
      disputedBy: { id: client.id },
      reason: "A entrega não corresponde ao combinado na proposta.",
      amountCents: 250_000,
    });
    expect((await freelancer.browser.get("/api/admin/disputes")).statusCode).toBe(403);
    await moderator.browser.post(`/api/admin/milestones/${milestones[0]}/resolve`, { outcome: "refund" });
    expect((await moderator.browser.get("/api/admin/disputes")).json()).toEqual([]);
    const [entry] = await audit(moderator);
    expect(entry).toMatchObject({
      action: "dispute.resolved",
      targetId: milestones[0],
      details: { outcome: "refund" },
    });

    await expect(db.$executeRaw`UPDATE audit_entries SET action = 'nothing'`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`DELETE FROM audit_entries`).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`TRUNCATE audit_entries`).rejects.toThrow(/append-only/);
    expect(await db.auditEntry.count()).toBe(1);
  });
});

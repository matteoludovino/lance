import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ConversationSummary, ConversationView, SentMessage } from "@lance/shared";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { directUser, person, publishProject, resetDb, sendProposal, testApp } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

type Someone = Awaited<ReturnType<typeof person>>;

/** A client and a freelancer whose proposal started a conversation. */
async function talking({ sandboxId = null as string | null } = {}) {
  const client = await person(app, ["client"], { sandboxId, name: "Helena Duarte" });
  const freelancer = await person(app, ["freelancer"], { sandboxId, name: "Marina Costa" });
  const project = await publishProject(client);
  const proposal = await sendProposal(freelancer, project.id);
  const [conversation] = (await client.browser.get("/api/conversations")).json() as ConversationSummary[];
  return { client, freelancer, project, proposal, conversationId: conversation!.id };
}

async function send(who: Someone, conversationId: string, body: string, clientId = randomUUID()) {
  const response = await who.browser.post(`/api/conversations/${conversationId}/messages`, {
    clientId,
    body,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json() as SentMessage;
}

const view = async (who: Someone, id: string, query = "") =>
  (await who.browser.get(`/api/conversations/${id}${query}`)).json() as ConversationView;

describe("conversations", () => {
  it("start with the proposal, between the two people only", async () => {
    const { client, freelancer, conversationId, project } = await talking();
    const fromClient = (await client.browser.get("/api/conversations")).json() as ConversationSummary[];
    expect(fromClient).toEqual([
      {
        id: conversationId,
        project: { id: project.id, title: "Loja virtual para torrefação" },
        other: { id: freelancer.id, name: "Marina Costa" },
        role: "client",
        lastMessage: null,
        unread: 0,
      },
    ]);
    const stranger = await directUser(app);
    expect((await stranger.browser.get(`/api/conversations/${conversationId}`)).statusCode).toBe(404);
    const write = await stranger.browser.post(`/api/conversations/${conversationId}/messages`, {
      clientId: randomUUID(),
      body: "oi",
    });
    expect(write.statusCode).toBe(404);
  });

  it("number messages 1, 2, 3… with no gaps, even sent all at once by both sides", async () => {
    const { client, freelancer, conversationId } = await talking();
    await Promise.all(
      Array.from({ length: 24 }, (_, n) =>
        send(n % 2 ? client : freelancer, conversationId, `mensagem ${n}`),
      ),
    );
    const { messages, lastSeq } = await view(client, conversationId);
    expect(lastSeq).toBe(24);
    expect(messages.map((m) => m.seq)).toEqual(Array.from({ length: 24 }, (_, n) => n + 1));
    expect(new Set(messages.map((m) => m.body)).size).toBe(24);
  });

  it("make a resend harmless: same browser id, same message", async () => {
    const { client, conversationId } = await talking();
    const clientId = randomUUID();
    const [a, b] = await Promise.all([
      send(client, conversationId, "Pode começar segunda?", clientId),
      send(client, conversationId, "Pode começar segunda?", clientId),
    ]);
    expect(a.message).toEqual(b.message);
    expect((await send(client, conversationId, "Pode começar segunda?", clientId)).message.id).toBe(
      a.message.id,
    );
    expect(await db.message.count()).toBe(1);
    expect((await view(client, conversationId)).lastSeq).toBe(1);
  });

  it("count unread per side, and receipts never move backwards", async () => {
    const { client, freelancer, conversationId } = await talking();
    await send(client, conversationId, "Oi, Marina!");
    await send(client, conversationId, "Viu o briefing?");
    expect((await freelancer.browser.get("/api/me/unread")).json()).toEqual({ total: 2 });
    expect((await client.browser.get("/api/me/unread")).json()).toEqual({ total: 0 });

    await freelancer.browser.post(`/api/conversations/${conversationId}/read`, { seq: 99 });
    expect((await view(freelancer, conversationId)).myReadSeq).toBe(2);
    await freelancer.browser.post(`/api/conversations/${conversationId}/read`, { seq: 1 });
    expect((await view(client, conversationId)).otherReadSeq).toBe(2);
    expect((await freelancer.browser.get("/api/me/unread")).json()).toEqual({ total: 0 });

    // Replying reads everything before the reply.
    await send(client, conversationId, "Tudo certo?");
    await send(freelancer, conversationId, "Tudo, começo amanhã.");
    expect((await view(freelancer, conversationId)).myReadSeq).toBe(4);
    const [summary] = (await client.browser.get("/api/conversations")).json() as ConversationSummary[];
    expect(summary).toMatchObject({
      unread: 1,
      lastMessage: { body: "Tudo, começo amanhã.", fromMe: false },
    });
  });

  it("page back through older messages and catch up on newer ones", async () => {
    const { client, conversationId } = await talking();
    for (let n = 1; n <= 60; n++) await send(client, conversationId, `m${n}`);
    const latest = await view(client, conversationId);
    expect([latest.messages.length, latest.messages[0]!.seq, latest.hasOlder]).toEqual([50, 11, true]);
    const older = await view(client, conversationId, "?before=11");
    expect([older.messages.map((m) => m.seq), older.hasOlder]).toEqual([
      Array.from({ length: 10 }, (_, n) => n + 1),
      false,
    ]);
    expect((await view(client, conversationId, "?after=57")).messages.map((m) => m.seq)).toEqual([
      58, 59, 60,
    ]);
  });
});

describe("contact details before a contract", () => {
  it("are delivered, flagged and warned about; after the contract, not anymore", async () => {
    const { client, freelancer, conversationId, proposal } = await talking();
    const sent = await send(freelancer, conversationId, "Me chama no zap (11) 91234-5678 que é mais rápido");
    expect(sent.warning?.sort()).toEqual(["outside_channel", "phone"]);
    expect((await db.message.findFirstOrThrow()).contactFlags.sort()).toEqual(["outside_channel", "phone"]);
    expect((await view(client, conversationId)).messages[0]!.body).toContain("91234-5678");
    expect(
      (await send(client, conversationId, "O orçamento é R$ 1.500,00, entrega 24/11.")).warning,
    ).toBeNull();

    await client.browser.post(`/api/proposals/${proposal.id}/accept`, { version: proposal.version });
    expect((await view(client, conversationId)).contractId).not.toBeNull();
    expect((await send(freelancer, conversationId, "Meu whats é 11 91234-5678")).warning).toBeNull();
  });
});

describe("invitations", () => {
  it("let a client start a conversation with a freelancer about an open project", async () => {
    const client = await person(app, ["client"]);
    const freelancer = await person(app, ["freelancer"]);
    const project = await publishProject(client);
    const invited = await client.browser.post(`/api/projects/${project.id}/invite`, {
      freelancerId: freelancer.id,
    });
    expect(invited.statusCode).toBe(201);
    const again = await client.browser.post(`/api/projects/${project.id}/invite`, {
      freelancerId: freelancer.id,
    });
    expect(again.json()).toEqual(invited.json());
    expect(
      ((await freelancer.browser.get("/api/conversations")).json() as ConversationSummary[])[0]!.role,
    ).toBe("freelancer");
    const notOwner = await freelancer.browser.post(`/api/projects/${project.id}/invite`, {
      freelancerId: freelancer.id,
    });
    expect(notOwner.statusCode).toBe(404);
  });

  it("can't reach a freelancer in someone else's sandbox", async () => {
    const sandbox = await app.get(Sandboxes).create();
    const client = await person(app, ["client"]);
    const hidden = await person(app, ["freelancer"], { sandboxId: sandbox });
    const project = await publishProject(client);
    const response = await client.browser.post(`/api/projects/${project.id}/invite`, {
      freelancerId: hidden.id,
    });
    expect(response.statusCode).toBe(404);
  });
});

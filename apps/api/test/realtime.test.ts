import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ConversationSummary, ServerEvent } from "@lance/shared";
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { MAX_SOCKETS_PER_USER } from "../src/realtime/hub.ts";
import { ORIGIN, person, publishProject, resetDb, sendProposal, testApp } from "./support.ts";

// A real server this time: WebSockets need a listening port.
const app = await testApp({ WS_HEARTBEAT_MS: "200" });
await app.listen({ port: 0, host: "127.0.0.1" });
const port = (app.getHttpServer().address() as { port: number }).port;
const db = app.get(PrismaService);
const open: WebSocket[] = [];
afterAll(async () => {
  for (const ws of open) ws.terminate();
  await app.close();
});
beforeEach(() => resetDb(db));

type Someone = Awaited<ReturnType<typeof person>>;

/** A connected socket that records what it receives. */
async function connect(
  who: Someone,
  { origin = ORIGIN, ticket, autoPong = true }: { origin?: string; ticket?: string; autoPong?: boolean } = {},
) {
  const pass = ticket ?? (await who.browser.post("/api/realtime/ticket")).json().ticket;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?ticket=${pass}`, { headers: { origin }, autoPong });
  open.push(ws);
  const events: ServerEvent[] = [];
  ws.on("message", (data) => events.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("unexpected-response", (_, response) => reject(new Error(`handshake ${response.statusCode}`)));
    ws.once("error", reject);
  });
  const closed = new Promise<number>((resolve) => ws.once("close", (code) => resolve(code)));
  return { ws, events, closed };
}

async function until(check: () => boolean, ms = 2000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function talking() {
  const client = await person(app, ["client"]);
  const freelancer = await person(app, ["freelancer"]);
  const project = await publishProject(client);
  await sendProposal(freelancer, project.id);
  const [conversation] = (await client.browser.get("/api/conversations")).json() as ConversationSummary[];
  return { client, freelancer, conversationId: conversation!.id };
}

describe("the WebSocket", () => {
  it("pushes each new message to both people, once, after it is written", async () => {
    const { client, freelancer, conversationId } = await talking();
    const [a, b] = [await connect(client), await connect(freelancer)];
    const clientId = randomUUID();
    await client.browser.post(`/api/conversations/${conversationId}/messages`, { clientId, body: "Oi!" });
    await client.browser.post(`/api/conversations/${conversationId}/messages`, { clientId, body: "Oi!" });
    await until(() => a.events.length === 1 && b.events.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(b.events).toEqual([
      {
        type: "message",
        conversationId,
        message: expect.objectContaining({ seq: 1, body: "Oi!", clientId }),
      },
    ]);
    expect(a.events).toHaveLength(1);
  });

  it("relays typing to the other person only, and read receipts to both", async () => {
    const { client, freelancer, conversationId } = await talking();
    const [a, b] = [await connect(client), await connect(freelancer)];
    a.ws.send(JSON.stringify({ type: "typing", conversationId }));
    await until(() => b.events.length === 1);
    expect(b.events[0]).toEqual({ type: "typing", conversationId, userId: client.id });

    await client.browser.post(`/api/conversations/${conversationId}/messages`, {
      clientId: randomUUID(),
      body: "Oi",
    });
    await freelancer.browser.post(`/api/conversations/${conversationId}/read`, { seq: 1 });
    await until(() => a.events.some((e) => e.type === "read"));
    expect(a.events.filter((e) => e.type !== "message")).toEqual([
      { type: "read", conversationId, userId: freelancer.id, seq: 1 },
    ]);
  });

  it("tells strangers nothing, and ignores their typing", async () => {
    const { client, conversationId } = await talking();
    const stranger = await person(app, ["freelancer"]);
    const [a, s] = [await connect(client), await connect(stranger)];
    s.ws.send(JSON.stringify({ type: "typing", conversationId }));
    s.ws.send("not json");
    await client.browser.post(`/api/conversations/${conversationId}/messages`, {
      clientId: randomUUID(),
      body: "Oi",
    });
    await until(() => a.events.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(s.events).toEqual([]);
    expect(a.events.map((e) => e.type)).toEqual(["message"]);
  });

  it("needs the web app's origin and a fresh one-time ticket", async () => {
    const { client } = await talking();
    await expect(connect(client, { origin: "https://elsewhere.example" })).rejects.toThrow("handshake 403");
    await expect(connect(client, { ticket: "made-up" })).rejects.toThrow("handshake 401");
    const ticket = (await client.browser.post("/api/realtime/ticket")).json().ticket;
    await connect(client, { ticket });
    await expect(connect(client, { ticket })).rejects.toThrow("handshake 401");
    expect((await client.browser.post("/api/realtime/ticket")).json().url).toBe("ws://localhost:8040/ws");
  });

  it("allows five sockets per person; a sixth is refused", async () => {
    const { client } = await talking();
    for (let n = 0; n < MAX_SOCKETS_PER_USER; n++) await connect(client);
    const sixth = await connect(client);
    expect(await sixth.closed).toBe(4008);
  });

  it("closes a session's sockets when it signs out, and every socket on a password reset", async () => {
    const { client, freelancer } = await talking();
    const a = await connect(client);
    const other = await connect(freelancer);
    await client.browser.post("/api/auth/logout");
    expect(await a.closed).toBe(4001);
    // The freelancer's socket is untouched.
    expect(other.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("drops a socket that stops answering pings", async () => {
    const { client } = await talking();
    // A client that never answers pings.
    const a = await connect(client, { autoPong: false });
    expect(await a.closed).toBe(1006);
  });
});

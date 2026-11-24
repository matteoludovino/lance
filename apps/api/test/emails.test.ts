import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { EmailPreferences } from "@lance/shared";
import { Mailer } from "../src/mail/mailer.service.ts";
import { verifyEmail, proposalReceived } from "../src/mail/templates.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import {
  Browser,
  ORIGIN,
  emailsTo,
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
const MINUTE = 60_000;

const emailOf = async (who: Someone) => (await db.user.findUniqueOrThrow({ where: { id: who.id } })).email;
const kinds = async (who: Someone) => (await emailsTo(app, await emailOf(who))).map((email) => email.kind);
const preferences = async (who: Someone) =>
  (await who.browser.get("/api/me/email-preferences")).json() as EmailPreferences;

/** One optional email (a proposal) and one account email (address confirmation) to the same person. */
async function sendBoth(who: Someone) {
  const mailer = app.get(Mailer);
  const to = { userId: who.id, email: await emailOf(who), sandboxId: null };
  await mailer.send(
    to,
    "proposal_received",
    proposalReceived("Ana", "Loja", "Marina", "R$ 10", "http://x/p"),
  );
  await mailer.send(to, "verify_email", verifyEmail("Ana", "http://x/v#t=abc"));
}

function unsubscribeToken(text: string): string {
  const match = text.match(/\/descadastro#t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/);
  if (!match) throw new Error("no unsubscribe link");
  return match[1]!;
}

describe("email preferences", () => {
  it("turn a category off; account email always goes", async () => {
    const someone = await person(app, ["client"]);
    expect(await preferences(someone)).toEqual({
      proposals: true,
      contracts: true,
      reviews: true,
      messages: true,
    });
    const turned = await someone.browser.put("/api/me/email-preferences", {
      proposals: false,
      contracts: true,
      reviews: true,
      messages: false,
    });
    expect(turned.json()).toMatchObject({ proposals: false, messages: false });
    await sendBoth(someone);
    expect(await kinds(someone)).toEqual(["verify_email"]);
    expect((await someone.browser.put("/api/me/email-preferences", { proposals: false })).statusCode).toBe(
      400,
    );
  });

  it("every optional email carries a signed link that unsubscribes without signing in", async () => {
    const someone = await person(app, ["client"]);
    await sendBoth(someone);
    const [proposal, account] = await emailsTo(app, await emailOf(someone));
    expect(account!.text).not.toContain("Descadastrar");
    expect(account!.html).not.toContain("<!--unsubscribe-->");
    expect(proposal!.html).toContain("Preferências de e-mail");
    const token = unsubscribeToken(proposal!.text);

    const anyone = new Browser(app);
    expect((await anyone.post("/api/email/unsubscribe", { token })).json()).toEqual({
      category: "proposals",
    });
    expect((await anyone.post("/api/email/unsubscribe", { token })).statusCode).toBe(200); // twice: same
    expect((await preferences(someone)).proposals).toBe(false);
    expect((await anyone.post("/api/email/resubscribe", { token })).statusCode).toBe(200);
    expect((await preferences(someone)).proposals).toBe(true);

    // A forged or altered link does nothing.
    const [body, mac] = token.split(".");
    const otherCategory = Buffer.from(`${someone.id}:contracts`).toString("base64url");
    for (const bad of [
      `${otherCategory}.${mac}`,
      `${body}.${"A".repeat(mac!.length)}`,
      `${body}`,
      `${token}.x`,
    ])
      expect((await anyone.post("/api/email/unsubscribe", { token: bad })).json().error.code).toBe(
        "invalid_link",
      );
    expect((await preferences(someone)).contracts).toBe(true);
  });

  it("one-click unsubscribe works from an email client (no Origin), and only that endpoint does", async () => {
    const someone = await person(app, ["client"]);
    await sendBoth(someone);
    const token = unsubscribeToken((await emailsTo(app, await emailOf(someone)))[0]!.text);
    const post = (url: string, headers: Record<string, string> = {}) =>
      app.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
        payload: "List-Unsubscribe=One-Click",
      });

    expect((await post(`/api/email/unsubscribe/one-click?token=${token}`)).statusCode).toBe(200);
    expect((await preferences(someone)).proposals).toBe(false);
    expect((await post("/api/email/unsubscribe/one-click?token=nope.nope")).statusCode).toBe(400);
    // Everything else still demands the web app's Origin.
    expect((await post("/api/email/resubscribe")).statusCode).toBe(403);
    expect((await post("/api/email/resubscribe", { origin: ORIGIN })).statusCode).toBe(400);
  });
});

describe("unread message digest", () => {
  async function talking() {
    const client = await person(app, ["client"], { name: "Helena Duarte" });
    const freelancer = await person(app, ["freelancer"], { name: "Marina Costa" });
    const project = await publishProject(client);
    await sendProposal(freelancer, project.id);
    const { id } = await db.conversation.findFirstOrThrow({ where: { projectId: project.id } });
    return { client, freelancer, conversationId: id };
  }
  const say = (who: Someone, conversationId: string, body: string) =>
    who.browser.post(`/api/conversations/${conversationId}/messages`, {
      clientId: crypto.randomUUID(),
      body,
    });
  const digests = async (who: Someone) =>
    (await emailsTo(app, await emailOf(who))).filter((email) => email.kind === "message_digest");

  it("goes once, 10 minutes after the first unread message, with how many are waiting", async () => {
    const { client, freelancer, conversationId } = await talking();
    await say(client, conversationId, "Oi, Marina! Vi sua proposta.");
    clock.advance(4 * MINUTE);
    await say(client, conversationId, "Consegue começar na segunda?");
    await say(client, conversationId, "E o prazo de 20 dias se mantém?");
    clock.advance(5 * MINUTE);
    expect(await digests(freelancer)).toEqual([]);
    clock.advance(2 * MINUTE);
    const [digest, ...more] = await digests(freelancer);
    expect(more).toEqual([]);
    expect(digest!.subject).toBe(
      "3 mensagens não lidas de Helena Duarte sobre “Loja virtual para torrefação”",
    );
    expect(digest!.text).toContain("E o prazo de 20 dias se mantém?");
    expect(digest!.text).toContain(`/mensagens/${conversationId}`);
    // The sender gets none for their own messages.
    expect(await digests(client)).toEqual([]);
    // Nothing new: nothing more, however long it waits.
    clock.advance(60 * MINUTE);
    expect(await digests(freelancer)).toHaveLength(1);
  });

  it("isn't sent when the messages were read in time, nor to someone who turned it off", async () => {
    const { client, freelancer, conversationId } = await talking();
    await say(client, conversationId, "Oi, Marina! Vi sua proposta.");
    const conversation = (await freelancer.browser.get(`/api/conversations/${conversationId}`)).json();
    await freelancer.browser.post(`/api/conversations/${conversationId}/read`, { seq: conversation.lastSeq });
    clock.advance(11 * MINUTE);
    expect(await digests(freelancer)).toEqual([]);

    await freelancer.browser.put("/api/me/email-preferences", {
      proposals: true,
      contracts: true,
      reviews: true,
      messages: false,
    });
    await say(client, conversationId, "Ficou alguma dúvida?");
    clock.advance(11 * MINUTE);
    expect(await digests(freelancer)).toEqual([]);
    expect(await db.pendingDigest.count()).toBe(0);
  });
});

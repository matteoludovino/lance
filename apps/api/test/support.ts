import type { ContractView, Me } from "@lance/shared";
import { createApp } from "../src/bootstrap.ts";
import { uuidv7 } from "../src/common/ids.ts";
import { hashToken, newToken } from "../src/common/secrets.ts";
import { loadEnv } from "../src/env.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Scheduler } from "../src/scheduler/scheduler.service.ts";
import type { Clock } from "../src/time/clock.ts";

export const ORIGIN = "http://localhost:3030";

export function testEnv(overrides: Record<string, string> = {}) {
  return loadEnv({
    DATABASE_URL: process.env["DATABASE_URL"]!,
    WEB_ORIGINS: ORIGIN,
    SCHEDULER: "off",
    ...overrides,
  });
}

export function testApp(overrides: Record<string, string> = {}, { clock }: { clock?: Clock } = {}) {
  return createApp(testEnv(overrides), { logger: false, clock });
}

/** Empties every table that tests write (the schema stays). */
export async function resetDb(db: PrismaService): Promise<void> {
  // The ledger is append-only; tests clear it the one way the database allows (a purge, for this
  // transaction only).
  await db.$transaction([
    db.$executeRawUnsafe(`SELECT set_config('lance.ledger_purge', 'on', true)`),
    db.$executeRawUnsafe(`SELECT set_config('lance.purge', 'on', true)`),
    db.$executeRawUnsafe(
      `TRUNCATE users, sandboxes, sessions, email_tokens, sent_emails, outbox_events,
        client_profiles, freelancer_profiles, projects, proposals, contracts, contract_milestones,
        conversations, messages, reviews, reports, audit_entries, pending_digests, ledger_entries, ledger_transactions, ledger_accounts, idempotency_keys
        RESTART IDENTITY CASCADE`,
    ),
  ]);
}

let addresses = 0;

/**
 * A browser for tests: its own client address (rate limits are per address), the web app's Origin on
 * every request, and a cookie jar.
 */
export class Browser {
  readonly ip = `10.0.${Math.floor(++addresses / 250)}.${addresses % 250}`;
  cookie: string | null = null;

  constructor(private readonly app: App) {}

  async request(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object) {
    const response = await this.app.inject({
      method,
      url,
      remoteAddress: this.ip,
      headers: {
        origin: ORIGIN,
        ...(this.cookie ? { cookie: `lance_session=${this.cookie}` } : {}),
      },
      ...(payload ? { payload } : {}),
    });
    const set = response.cookies.find((cookie) => cookie.name === "lance_session");
    if (set) this.cookie = set.value || null;
    return response;
  }

  get = (url: string) => this.request("GET", url);
  post = (url: string, payload?: object) => this.request("POST", url, payload ?? {});
  put = (url: string, payload: object) => this.request("PUT", url, payload);
  patch = (url: string, payload: object) => this.request("PATCH", url, payload);
}

export type App = Awaited<ReturnType<typeof testApp>>;

/** The emails kept for an address (no SMTP in tests), oldest first, after the outbox has run. */
export async function emailsTo(app: App, to: string) {
  await app.get(Scheduler).runOnce();
  return app.get(PrismaService).sentEmail.findMany({ where: { to }, orderBy: { createdAt: "asc" } });
}

/** The token in the last emailed link of a kind ("#t=…"). */
export async function linkToken(app: App, to: string, kind: string): Promise<string> {
  const emails = (await emailsTo(app, to)).filter((email) => email.kind === kind);
  const match = emails.at(-1)?.text.match(/#t=([A-Za-z0-9_-]{43})/);
  if (!match) throw new Error(`no ${kind} link sent to ${to}`);
  return match[1]!;
}

/** Signs up, follows the verification link, and returns the signed-in browser. */
export async function verifiedUser(app: App, name = "Ana Souza", email = `ana.${addresses}@exemplo.com`) {
  const browser = new Browser(app);
  await browser.post("/api/auth/signup", { name, email, password: "senha-boa-123" });
  const verified = await browser.post("/api/auth/verify", {
    token: await linkToken(app, email, "verify_email"),
  });
  if (verified.statusCode !== 200) throw new Error(`verify failed: ${verified.body}`);
  return { browser, email, me: verified.json() as Me };
}

/** A user written straight to the database (in a sandbox or not), signed in through a session row. */
export async function directUser(app: App, { sandboxId = null as string | null, name = "Bruno Lima" } = {}) {
  const db = app.get(PrismaService);
  const id = uuidv7();
  await db.user.create({
    data: { id, email: `${id}@teste.lance`, name, sandboxId, emailVerifiedAt: new Date() },
  });
  const token = newToken();
  await db.session.create({
    data: {
      id: uuidv7(),
      tokenHash: hashToken(token),
      userId: id,
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    },
  });
  const browser = new Browser(app);
  browser.cookie = token;
  return { id, browser };
}

export const CLIENT_PROFILE = { company: "Café da Serra", about: "Torrefação familiar." };
export const FREELANCER_PROFILE = {
  headline: "Desenvolvedora Shopify",
  bio: "Monto lojas virtuais para pequenos negócios há seis anos.",
  category: "desenvolvimento",
  skills: ["shopify", "wordpress"],
  minBudgetCents: 100_000,
  available: true,
};

/** A signed-in user with a client profile, a freelancer profile, or both. */
export async function person(
  app: App,
  sides: ("client" | "freelancer")[],
  options: { sandboxId?: string | null; name?: string } = {},
) {
  const user = await directUser(app, options);
  if (sides.includes("client")) await user.browser.put("/api/me/client-profile", CLIENT_PROFILE);
  if (sides.includes("freelancer")) await user.browser.put("/api/me/freelancer-profile", FREELANCER_PROFILE);
  return user;
}

export const PROJECT = {
  title: "Loja virtual para torrefação",
  description: "Precisamos de uma loja Shopify com frete por CEP e assinatura mensal de café.",
  category: "desenvolvimento",
  skills: ["shopify"],
  budgetMinCents: 300_000,
  budgetMaxCents: 600_000,
};

export const PROPOSAL = {
  coverLetter: "Já fiz quatro lojas de café e conheço bem o frete por CEP e assinaturas.",
  deliveryDays: 20,
  milestones: [
    { title: "Tema e catálogo", amountCents: 250_000 },
    { title: "Frete e assinatura", amountCents: 200_000 },
  ],
};

type Someone = Awaited<ReturnType<typeof person>>;

export async function publishProject(owner: Someone, overrides: object = {}): Promise<{ id: string }> {
  const response = await owner.browser.post("/api/projects", { ...PROJECT, ...overrides, publish: true });
  if (response.statusCode !== 201) throw new Error(`publish failed: ${response.body}`);
  return response.json();
}

export async function sendProposal(freelancer: Someone, projectId: string, overrides: object = {}) {
  const response = await freelancer.browser.post(`/api/projects/${projectId}/proposals`, {
    ...PROPOSAL,
    ...overrides,
  });
  if (response.statusCode !== 201) throw new Error(`proposal failed: ${response.body}`);
  return response.json() as Promise<{ id: string; version: number }>;
}

/**
 * A client and a freelancer under an active contract (by default two milestones: R$ 2.500 and
 * R$ 2.000,00, fee 10%).
 */
export async function hire(
  app: App,
  { sandboxId = null as string | null, milestones = PROPOSAL.milestones } = {},
) {
  const client = await person(app, ["client"], { sandboxId, name: "Helena Duarte" });
  const freelancer = await person(app, ["freelancer"], { sandboxId, name: "Marina Costa" });
  const project = await publishProject(client);
  const proposal = await sendProposal(freelancer, project.id, { milestones });
  const accepted = await client.browser.post(`/api/proposals/${proposal.id}/accept`, {
    version: proposal.version,
  });
  if (accepted.statusCode !== 200) throw new Error(`accept failed: ${accepted.body}`);
  const contractId: string = accepted.json().contractId;
  const contract = (await client.browser.get(`/api/contracts/${contractId}`)).json() as ContractView;
  return {
    client,
    freelancer,
    contractId,
    projectId: project.id,
    milestones: contract.milestones.map((m) => m.id),
  };
}

/** A signed-in admin (in a sandbox or not). */
export async function admin(app: App, sandboxId: string | null = null) {
  const user = await directUser(app, { sandboxId, name: "Admin" });
  await app.get(PrismaService).user.update({ where: { id: user.id }, data: { role: "admin" } });
  return user;
}

/** A contract carried to the end: every milestone funded, delivered and approved. */
export async function completed(app: App, options: Parameters<typeof hire>[1] = {}) {
  const hired = await hire(app, options);
  const note = { note: "Entrega feita conforme combinado." };
  for (const id of hired.milestones) {
    await hired.client.browser.post(`/api/milestones/${id}/fund`);
    await hired.freelancer.browser.post(`/api/milestones/${id}/submit`, note);
    await hired.client.browser.post(`/api/milestones/${id}/approve`);
  }
  return hired;
}

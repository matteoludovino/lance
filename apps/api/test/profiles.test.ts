import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FreelancerProfileInput } from "@lance/shared";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { Browser, directUser, resetDb, testApp, verifiedUser } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
const sandboxes = app.get(Sandboxes);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

const FREELANCER: FreelancerProfileInput = {
  headline: "Desenvolvedora React e Next.js",
  bio: "Construo aplicações web rápidas e acessíveis há seis anos.",
  category: "desenvolvimento",
  skills: ["react", "nextjs", "typescript"],
  minBudgetCents: 150_000,
  available: true,
  city: "Recife",
  state: "PE",
};

describe("profiles", () => {
  it("lets one account have both sides, shown in /me", async () => {
    const { browser } = await verifiedUser(app);
    const asFreelancer = await browser.put("/api/me/freelancer-profile", FREELANCER);
    expect(asFreelancer.statusCode).toBe(200);
    expect(asFreelancer.json()).toMatchObject({ freelancer: FREELANCER, client: null });

    const both = await browser.put("/api/me/client-profile", { company: "Loja da Ana", about: "" });
    expect(both.json()).toMatchObject({
      freelancer: { headline: FREELANCER.headline },
      client: { company: "Loja da Ana", about: null, city: null, state: null },
    });

    const renamed = await browser.patch("/api/me", { name: "Ana  Lima" });
    expect(renamed.json().name).toBe("Ana Lima");
  });

  it("checks profiles against the catalog", async () => {
    const { browser } = await verifiedUser(app);
    const response = await browser.put("/api/me/freelancer-profile", {
      ...FREELANCER,
      skills: ["cobol"],
      minBudgetCents: 12.5,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fields.map((f: { path: string }) => f.path)).toEqual([
      "skills.0",
      "minBudgetCents",
    ]);
  });

  it("tells the web app who is signed in, without an error for visitors", async () => {
    const visitor = await new Browser(app).get("/api/session");
    expect(visitor.statusCode).toBe(200);
    expect(visitor.json()).toEqual({ me: null });
    const { browser, me } = await verifiedUser(app);
    expect((await browser.get("/api/session")).json()).toEqual({ me });
  });

  it("needs a session to edit", async () => {
    expect((await new Browser(app).put("/api/me/client-profile", {})).statusCode).toBe(401);
  });

  it("shows a public page without the email", async () => {
    const { browser, me } = await verifiedUser(app);
    await browser.put("/api/me/freelancer-profile", FREELANCER);
    const page = await new Browser(app).get(`/api/freelancers/${me.id}`);
    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({ id: me.id, name: me.name, ...FREELANCER });
    expect(page.body).not.toContain(me.email);
    expect((await new Browser(app).get(`/api/clients/${me.id}`)).statusCode).toBe(404);
    expect((await new Browser(app).get("/api/freelancers/not-an-id")).statusCode).toBe(404);
  });
});

describe("demo isolation", () => {
  it("shows a sandbox's people to that sandbox only; the seeded ones to everyone", async () => {
    const [a, b] = [await sandboxes.create(), await sandboxes.create()];
    const seeded = await directUser(app);
    const inA = await directUser(app, { sandboxId: a });
    const otherInA = await directUser(app, { sandboxId: a });
    const inB = await directUser(app, { sandboxId: b });
    for (const user of [seeded, inA, inB]) {
      expect((await user.browser.put("/api/me/freelancer-profile", FREELANCER)).statusCode).toBe(200);
    }
    const status = (viewer: Browser, id: string) =>
      viewer.get(`/api/freelancers/${id}`).then((response) => response.statusCode);
    const anonymous = new Browser(app);

    expect(await status(anonymous, seeded.id)).toBe(200);
    expect(await status(inB.browser, seeded.id)).toBe(200);
    expect(await status(otherInA.browser, inA.id)).toBe(200);
    expect(await status(inB.browser, inA.id)).toBe(404);
    expect(await status(anonymous, inA.id)).toBe(404);
    expect(await status(seeded.browser, inA.id)).toBe(404);
  });

  it("copies the sandbox onto what a person writes", async () => {
    const sandbox = await sandboxes.create();
    const user = await directUser(app, { sandboxId: sandbox });
    await user.browser.put("/api/me/client-profile", {});
    expect((await db.clientProfile.findUniqueOrThrow({ where: { userId: user.id } })).sandboxId).toBe(
      sandbox,
    );
  });
});

describe("moderation", () => {
  it("takes a hidden profile or a suspended account off the public pages; owners still see theirs", async () => {
    const hidden = await directUser(app);
    const suspended = await directUser(app);
    for (const user of [hidden, suspended]) await user.browser.put("/api/me/freelancer-profile", FREELANCER);
    await db.freelancerProfile.update({ where: { userId: hidden.id }, data: { hiddenAt: clock.now() } });
    await db.user.update({ where: { id: suspended.id }, data: { suspendedAt: clock.now() } });

    const visitor = new Browser(app);
    expect((await visitor.get(`/api/freelancers/${hidden.id}`)).statusCode).toBe(404);
    expect((await visitor.get(`/api/freelancers/${suspended.id}`)).statusCode).toBe(404);
    expect((await hidden.browser.get(`/api/freelancers/${hidden.id}`)).statusCode).toBe(200);
  });
});

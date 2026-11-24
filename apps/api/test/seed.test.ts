import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { seedId, seedMarketplace } from "../src/seed/seed.ts";
import { SEED_CLIENTS, SEED_FREELANCERS } from "../src/seed/people.ts";
import { SEED_PROJECTS } from "../src/seed/projects.ts";
import { Browser, resetDb, testApp } from "./support.ts";

const app = await testApp();
const db = app.get(PrismaService);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

describe("seed", () => {
  it("writes valid people, and running it again changes nothing", async () => {
    await seedMarketplace(db);
    await seedMarketplace(db);
    expect(await db.freelancerProfile.count()).toBe(SEED_FREELANCERS.length);
    expect(await db.clientProfile.count()).toBe(SEED_CLIENTS.length);
    expect(await db.project.count({ where: { status: "open" } })).toBe(SEED_PROJECTS.length);
    expect(
      await db.user.count({ where: { OR: [{ sandboxId: { not: null } }, { passwordHash: { not: null } }] } }),
    ).toBe(0);
  });

  it("shows seeded people to anyone, and nobody can sign in as them", async () => {
    await seedMarketplace(db);
    const visitor = new Browser(app);
    const marina = await visitor.get(`/api/freelancers/${seedId("marina-costa")}`);
    expect(marina.json()).toMatchObject({ name: "Marina Costa", skills: ["react", "nextjs", "typescript"] });
    expect((await visitor.get(`/api/clients/${seedId("cafe-serra")}`)).json().company).toBe("Café da Serra");
    const login = await visitor.post("/api/auth/login", {
      email: "marina-costa@seed.lance.invalid",
      password: "qualquer-coisa",
    });
    expect(login.statusCode).toBe(401);
    expect(
      (await visitor.post("/api/auth/forgot-password", { email: "marina-costa@seed.lance.invalid" }))
        .statusCode,
    ).toBe(202);
    expect(await db.outboxEvent.count()).toBe(0);
  });

  it("gives stable, valid UUIDs", () => {
    expect(seedId("marina-costa")).toBe(seedId("marina-costa"));
    expect(seedId("marina-costa")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

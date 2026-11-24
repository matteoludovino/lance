import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { MyProposal, Page, ProjectDetail, ProjectSummary, ProposalView } from "@lance/shared";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { Browser, PROJECT, PROPOSAL, emailsTo, person, resetDb, testApp } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
const sandboxes = app.get(Sandboxes);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

type Someone = Awaited<ReturnType<typeof person>>;

async function publish(owner: Someone, overrides: object = {}): Promise<ProjectDetail> {
  const response = await owner.browser.post("/api/projects", { ...PROJECT, ...overrides, publish: true });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function propose(
  freelancer: Someone,
  projectId: string,
  overrides: object = {},
): Promise<ProposalView> {
  const response = await freelancer.browser.post(`/api/projects/${projectId}/proposals`, {
    ...PROPOSAL,
    ...overrides,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json();
}

const list = async (viewer: Browser, query = "") =>
  ((await viewer.get(`/api/projects${query}`)).json() as Page<ProjectSummary>).items.map((p) => p.id);

describe("projects", () => {
  it("need a client profile to publish", async () => {
    const someone = await person(app, ["freelancer"]);
    const response = await someone.browser.post("/api/projects", { ...PROJECT, publish: true });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("needs_client_profile");
  });

  it("stay private as drafts, appear once published, and can be edited while open", async () => {
    const owner = await person(app, ["client"]);
    const draft = (await owner.browser.post("/api/projects", { ...PROJECT, publish: false })).json();
    expect(draft).toMatchObject({ status: "draft", publishedAt: null, isOwner: true });
    const visitor = new Browser(app);
    expect(await list(visitor)).toEqual([]);
    expect((await visitor.get(`/api/projects/${draft.id}`)).statusCode).toBe(404);

    const published = (await owner.browser.post(`/api/projects/${draft.id}/publish`)).json();
    expect(published).toMatchObject({ status: "open", client: { company: "Café da Serra" } });
    expect(await list(visitor)).toEqual([draft.id]);
    expect((await visitor.get(`/api/projects/${draft.id}`)).json()).toMatchObject({ isOwner: false });

    const edited = await owner.browser.put(`/api/projects/${draft.id}`, {
      ...PROJECT,
      title: "Loja virtual nova",
    });
    expect(edited.json().title).toBe("Loja virtual nova");
    const stranger = await person(app, ["client"]);
    expect((await stranger.browser.put(`/api/projects/${draft.id}`, PROJECT)).statusCode).toBe(403);
  });

  it("are listed newest first, filtered, and paged without repeats", async () => {
    const owner = await person(app, ["client"]);
    const ids: string[] = [];
    for (let n = 0; n < 23; n++) {
      // Most share a publication instant: the id breaks ties.
      if (n % 5 === 0) clock.advance(1000);
      ids.push((await publish(owner, n === 7 ? { category: "design", skills: ["figma"] } : {})).id);
    }
    const visitor = new Browser(app);
    const first = (await visitor.get("/api/projects")).json() as Page<ProjectSummary>;
    expect(first.items).toHaveLength(20);
    const second = (await visitor.get(`/api/projects?cursor=${first.next}`)).json() as Page<ProjectSummary>;
    expect(second.next).toBeNull();
    // Newest first; within one instant, by id: every project exactly once.
    const expected = (
      await db.project.findMany({ orderBy: [{ publishedAt: "desc" }, { id: "desc" }], select: { id: true } })
    ).map((p) => p.id);
    expect([...first.items, ...second.items].map((p) => p.id)).toEqual(expected);
    expect(new Set(expected)).toEqual(new Set(ids));
    expect(first.items[0]!.id).toBe(expected[0]);
    expect(ids.slice(-3)).toContain(expected[0]);

    expect(await list(visitor, "?category=design")).toEqual([ids[7]]);
    expect(await list(visitor, "?skill=figma")).toEqual([ids[7]]);
    expect((await visitor.get("/api/projects?skill=cobol")).statusCode).toBe(400);
  });
});

describe("proposals", () => {
  it("are priced as the sum of their milestones, and the price is for the two parties only", async () => {
    const owner = await person(app, ["client"]);
    const freelancer = await person(app, ["freelancer"]);
    const project = await publish(owner);
    const proposal = await propose(freelancer, project.id);
    expect(proposal).toMatchObject({ status: "submitted", version: 1, priceCents: 450_000 });

    const third = await person(app, ["freelancer"]);
    const seen = (await third.browser.get(`/api/projects/${project.id}`)).json();
    expect(seen).toMatchObject({ proposalCount: 1, myProposal: null });
    expect(JSON.stringify(seen)).not.toContain("450000");
    expect((await third.browser.get(`/api/projects/${project.id}/proposals`)).statusCode).toBe(403);

    const forOwner = (
      await owner.browser.get(`/api/projects/${project.id}/proposals`)
    ).json() as ProposalView[];
    expect(forOwner).toMatchObject([{ id: proposal.id, priceCents: 450_000 }]);
    expect((await freelancer.browser.get(`/api/projects/${project.id}`)).json().myProposal.id).toBe(
      proposal.id,
    );
    expect(
      ((await freelancer.browser.get("/api/me/proposals")).json() as MyProposal[])[0]!.project.title,
    ).toBe(PROJECT.title);

    const [email] = await emailsTo(app, (await db.user.findUniqueOrThrow({ where: { id: owner.id } })).email);
    expect(email).toMatchObject({ kind: "proposal_received" });
    expect(email!.text.replace(/\s/g, " ")).toContain("R$ 4.500,00");
  });

  it("need a freelancer profile, and never go to one's own project", async () => {
    const owner = await person(app, ["client", "freelancer"]);
    const project = await publish(owner);
    const own = await owner.browser.post(`/api/projects/${project.id}/proposals`, PROPOSAL);
    expect(own.json().error.code).toBe("own_project");
    const clientOnly = await person(app, ["client"]);
    const response = await clientOnly.browser.post(`/api/projects/${project.id}/proposals`, PROPOSAL);
    expect(response.json().error.code).toBe("needs_freelancer_profile");
  });

  it("are one per freelancer and project; withdrawing and sending again reopens the same one", async () => {
    const owner = await person(app, ["client"]);
    const freelancer = await person(app, ["freelancer"]);
    const project = await publish(owner);
    const first = await propose(freelancer, project.id);
    const twice = await freelancer.browser.post(`/api/projects/${project.id}/proposals`, PROPOSAL);
    expect(twice.statusCode).toBe(409);

    expect((await freelancer.browser.post(`/api/proposals/${first.id}/withdraw`)).json().status).toBe(
      "withdrawn",
    );
    expect(await owner.browser.get(`/api/projects/${project.id}/proposals`).then((r) => r.json())).toEqual(
      [],
    );
    const again = await propose(freelancer, project.id, { deliveryDays: 10 });
    expect(again).toMatchObject({ id: first.id, status: "submitted", version: 2, deliveryDays: 10 });
    expect(await db.conversation.count()).toBe(1);
  });

  it("can't be sent twice at the same moment", async () => {
    const owner = await person(app, ["client"]);
    const freelancer = await person(app, ["freelancer"]);
    const project = await publish(owner);
    const answers = await Promise.all(
      [1, 2].map(() => freelancer.browser.post(`/api/projects/${project.id}/proposals`, PROPOSAL)),
    );
    expect(answers.map((a) => a.statusCode).sort()).toEqual([201, 409]);
    expect(await db.proposal.count()).toBe(1);
  });
});

describe("accepting a proposal", () => {
  async function market() {
    const owner = await person(app, ["client"], { name: "Helena Duarte" });
    const [ana, bia] = [
      await person(app, ["freelancer"], { name: "Ana" }),
      await person(app, ["freelancer"], { name: "Bia" }),
    ];
    const project = await publish(owner);
    return { owner, ana, bia, project, a: await propose(ana, project.id), b: await propose(bia, project.id) };
  }

  it("creates the contract from the milestones, and declines the others", async () => {
    const { owner, ana, bia, project, a, b } = await market();
    const response = await owner.browser.post(`/api/proposals/${a.id}/accept`, { version: 1 });
    expect(response.statusCode).toBe(200);
    const contract = await db.contract.findUniqueOrThrow({
      where: { id: response.json().contractId },
      include: { milestones: { orderBy: { position: "asc" } } },
    });
    expect(contract).toMatchObject({
      projectId: project.id,
      clientId: owner.id,
      freelancerId: ana.id,
      feeBps: 1000,
    });
    expect(contract.priceCents).toBe(450_000n);
    expect(contract.milestones.map((m) => [m.position, m.title, m.amountCents, m.status])).toEqual([
      [1, "Tema e catálogo", 250_000n, "pending_funding"],
      [2, "Frete e assinatura", 200_000n, "pending_funding"],
    ]);

    const detail = (await ana.browser.get(`/api/projects/${project.id}`)).json() as ProjectDetail;
    expect(detail).toMatchObject({
      status: "in_progress",
      contractId: contract.id,
      myProposal: { status: "accepted" },
    });
    expect((await bia.browser.get(`/api/projects/${project.id}`)).json().myProposal.status).toBe("declined");
    expect(await list(new Browser(app))).toEqual([]);

    const emailsOf = async (who: Someone) =>
      (await emailsTo(app, (await db.user.findUniqueOrThrow({ where: { id: who.id } })).email)).map(
        (e) => e.kind,
      );
    expect(await emailsOf(ana)).toEqual(["proposal_accepted"]);
    expect(await emailsOf(bia)).toEqual(["proposal_declined"]);
    expect((await owner.browser.post(`/api/proposals/${b.id}/accept`, { version: 1 })).statusCode).toBe(409);
  });

  it("refuses a version the client didn't see", async () => {
    const { owner, ana, a } = await market();
    await ana.browser.put(`/api/proposals/${a.id}`, {
      ...PROPOSAL,
      milestones: [{ title: "Tudo de uma vez", amountCents: 900_000 }],
    });
    const stale = await owner.browser.post(`/api/proposals/${a.id}/accept`, { version: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("proposal_changed");
    expect(await db.contract.count()).toBe(0);
    expect((await owner.browser.post(`/api/proposals/${a.id}/accept`, { version: 2 })).statusCode).toBe(200);
    expect((await db.contract.findFirstOrThrow()).priceCents).toBe(900_000n);
  });

  it("lets only one of two simultaneous acceptances through", async () => {
    for (let round = 0; round < 5; round++) {
      await resetDb(db);
      const { owner, a, b } = await market();
      const answers = await Promise.all([
        owner.browser.post(`/api/proposals/${a.id}/accept`, { version: 1 }),
        owner.browser.post(`/api/proposals/${b.id}/accept`, { version: 1 }),
      ]);
      expect(answers.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect(await db.contract.count()).toBe(1);
      expect(await db.proposal.count({ where: { status: "accepted" } })).toBe(1);
    }
  });

  it("and a withdrawal at the same moment: one of them wins, consistently", async () => {
    for (let round = 0; round < 5; round++) {
      await resetDb(db);
      const { owner, ana, a } = await market();
      const [accept, withdraw] = await Promise.all([
        owner.browser.post(`/api/proposals/${a.id}/accept`, { version: 1 }),
        ana.browser.post(`/api/proposals/${a.id}/withdraw`),
      ]);
      expect([accept.statusCode, withdraw.statusCode].sort()).toEqual([200, 409]);
      const proposal = await db.proposal.findUniqueOrThrow({ where: { id: a.id } });
      const project = await db.project.findFirstOrThrow();
      if (accept.statusCode === 200) {
        expect([proposal.status, project.status, await db.contract.count()]).toEqual([
          "accepted",
          "in_progress",
          1,
        ]);
      } else {
        expect([proposal.status, project.status, await db.contract.count()]).toEqual([
          "withdrawn",
          "open",
          0,
        ]);
      }
    }
  });

  it("is only for the project's owner", async () => {
    const { ana, a } = await market();
    expect((await ana.browser.post(`/api/proposals/${a.id}/accept`, { version: 1 })).statusCode).toBe(404);
  });
});

describe("closing a project", () => {
  it("declines what was pending and takes no more proposals", async () => {
    const owner = await person(app, ["client"]);
    const freelancer = await person(app, ["freelancer"]);
    const late = await person(app, ["freelancer"]);
    const project = await publish(owner);
    const proposal = await propose(freelancer, project.id);
    expect((await owner.browser.post(`/api/projects/${project.id}/close`)).json().status).toBe("cancelled");
    expect((await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe("declined");
    const after = await late.browser.post(`/api/projects/${project.id}/proposals`, PROPOSAL);
    expect(after.json().error.code).toBe("project_not_open");
    expect((await owner.browser.post(`/api/projects/${project.id}/close`)).statusCode).toBe(409);
  });
});

describe("demo isolation", () => {
  it("keeps a visitor's projects and proposals inside their sandbox", async () => {
    const [a, b] = [await sandboxes.create(), await sandboxes.create()];
    const real = await person(app, ["client"]);
    const realProject = await publish(real);
    const visitorA = await person(app, ["client", "freelancer"], { sandboxId: a });
    const visitorB = await person(app, ["freelancer"], { sandboxId: b });
    clock.advance(1000); // newer, so it lists first (within one instant, ids order at random)
    const projectA = await publish(visitorA);

    expect(await list(new Browser(app))).toEqual([realProject.id]);
    expect(await list(visitorB.browser)).toEqual([realProject.id]);
    expect(await list(visitorA.browser)).toEqual([projectA.id, realProject.id]);
    expect((await visitorB.browser.get(`/api/projects/${projectA.id}`)).statusCode).toBe(404);
    expect((await visitorB.browser.post(`/api/projects/${projectA.id}/proposals`, PROPOSAL)).statusCode).toBe(
      404,
    );

    // A visitor's proposal to a real project stays in the visitor's sandbox: the real owner never sees it.
    await propose(visitorA, realProject.id);
    expect((await visitorA.browser.get(`/api/projects/${realProject.id}`)).json().proposalCount).toBe(1);
    expect((await real.browser.get(`/api/projects/${realProject.id}`)).json().proposalCount).toBe(0);
    expect((await real.browser.get(`/api/projects/${realProject.id}/proposals`)).json()).toEqual([]);
  });
});

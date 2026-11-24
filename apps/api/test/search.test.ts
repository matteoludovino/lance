import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  bayesian,
  SEARCH_MAX_PAGES,
  SEARCH_PAGE_SIZE,
  type FreelancerResults,
  type ProjectResults,
} from "@lance/shared";
import { uuidv7 } from "../src/common/ids.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { seedMarketplace } from "../src/seed/seed.ts";
import { FakeClock } from "../src/time/clock.ts";
import {
  Browser,
  FREELANCER_PROFILE,
  PROJECT,
  directUser,
  person,
  publishProject,
  resetDb,
  testApp,
} from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

type Someone = Awaited<ReturnType<typeof person>>;

async function projects(viewer: Browser, query = ""): Promise<ProjectResults> {
  const response = await viewer.get(`/api/projects${query}`);
  if (response.statusCode !== 200) throw new Error(`search failed: ${response.body}`);
  return response.json();
}

async function freelancers(viewer: Browser, query = ""): Promise<FreelancerResults> {
  const response = await viewer.get(`/api/freelancers${query}`);
  if (response.statusCode !== 200) throw new Error(`search failed: ${response.body}`);
  return response.json();
}

const titles = (results: ProjectResults) => results.items.map((p) => p.title);

/** A project published now, a second after the previous one (so "newest first" is unambiguous). */
async function project(owner: Someone, overrides: object) {
  clock.advance(1000);
  return publishProject(owner, overrides);
}

async function freelancer(
  overrides: object = {},
  options: { sandboxId?: string | null; name?: string } = {},
) {
  const someone = await person(app, [], options);
  const response = await someone.browser.put("/api/me/freelancer-profile", {
    ...FREELANCER_PROFILE,
    ...overrides,
  });
  if (response.statusCode !== 200) throw new Error(`profile failed: ${response.body}`);
  return someone;
}

/** Reviews of a freelancer from the marketplace's history (no contract: always revealed). */
async function rated(who: { id: string }, ratings: number[], sandboxId: string | null = null) {
  const author = await directUser(app, { sandboxId, name: "Cliente Antigo" });
  await db.review.createMany({
    data: ratings.map((rating) => ({
      id: uuidv7(),
      authorId: author.id,
      revieweeId: who.id,
      revieweeRole: "freelancer" as const,
      rating,
      comment: "Entregou o combinado.",
      sandboxId,
    })),
  });
}

/**
 * A demo visitor's review of someone (seeded, say), through a contract in the visitor's sandbox that
 * ended long enough ago for the review to be revealed.
 */
async function sandboxReview(
  author: { id: string },
  reviewee: { id: string },
  sandboxId: string,
  rating: number,
) {
  const ended = new Date(clock.now().getTime() - 30 * 24 * 3_600_000);
  const [projectId, proposalId, contractId] = [uuidv7(), uuidv7(), uuidv7()];
  await db.project.create({
    data: {
      id: projectId,
      clientId: author.id,
      sandboxId,
      title: "Projeto da visita",
      description: PROJECT.description,
      category: "design",
      skills: ["figma"],
      budgetMinCents: 10_000n,
      budgetMaxCents: 20_000n,
      status: "completed",
    },
  });
  await db.proposal.create({
    data: {
      id: proposalId,
      projectId,
      freelancerId: reviewee.id,
      sandboxId,
      coverLetter: PROJECT.description,
      deliveryDays: 5,
      milestones: [],
      priceCents: 10_000n,
      status: "accepted",
      submittedAt: ended,
    },
  });
  await db.contract.create({
    data: {
      id: contractId,
      projectId,
      proposalId,
      clientId: author.id,
      freelancerId: reviewee.id,
      sandboxId,
      priceCents: 10_000n,
      feeBps: 1000,
      autoReleaseHours: 168,
      status: "completed",
      completedAt: ended,
    },
  });
  await db.review.create({
    data: {
      id: uuidv7(),
      contractId,
      authorId: author.id,
      revieweeId: reviewee.id,
      revieweeRole: "freelancer",
      rating,
      comment: "Avaliação feita na demonstração.",
      sandboxId,
    },
  });
}

describe("project search", () => {
  it("reads Portuguese: without accents, by word stem, title before description", async () => {
    const owner = await person(app, ["client"]);
    await project(owner, {
      title: "Manutenção de site institucional",
      description: "O site precisa de pequenas correções e de programação de um formulário novo.",
    });
    await project(owner, {
      title: "Programação de aplicativo de delivery",
      description: "Aplicativo para pedidos de uma rede de restaurantes, com pagamento online.",
    });
    await project(owner, {
      title: "Logotipo para cafeteria de bairro",
      description: "Identidade visual simples para uma cafeteria que abre no mês que vem.",
      category: "design",
      skills: ["identidade-visual"],
    });
    const visitor = new Browser(app);

    const found = await projects(visitor, "?q=programacao");
    expect(titles(found)).toEqual([
      "Programação de aplicativo de delivery",
      "Manutenção de site institucional",
    ]);
    expect(found).toMatchObject({ total: 2, sort: "relevance" });
    // And the other way: typed with accents, found where it was written without.
    expect((await projects(visitor, `?q=${encodeURIComponent("programação")}`)).total).toBe(2);
    expect(titles(await projects(visitor, `?q=${encodeURIComponent("cafetéria")}`))).toEqual([
      "Logotipo para cafeteria de bairro",
    ]);
    // Plural and singular share a stem; the words of a skill slug are words too.
    expect(titles(await projects(visitor, "?q=aplicativos"))).toEqual([
      "Programação de aplicativo de delivery",
    ]);
    expect(titles(await projects(visitor, "?q=identidade"))).toEqual(["Logotipo para cafeteria de bairro"]);
    // Web search syntax: a phrase, and a word left out.
    expect(titles(await projects(visitor, `?q=${encodeURIComponent('"site institucional"')}`))).toHaveLength(
      1,
    );
    expect(titles(await projects(visitor, "?q=programacao+-delivery"))).toEqual([
      "Manutenção de site institucional",
    ]);
    // Only stop words: no words to look for, so no text filter.
    expect((await projects(visitor, "?q=de")).total).toBe(3);
    // Whatever people type, never a 500.
    for (const odd of ["&&& !( :*", "'; DROP TABLE projects; --", "\\", "ação & | !"])
      expect((await visitor.get(`/api/projects?q=${encodeURIComponent(odd)}`)).statusCode).toBe(200);
  });

  it("filters by category, all the skills asked and budget; facets count around the filters", async () => {
    const owner = await person(app, ["client"]);
    await project(owner, {
      title: "Loja Shopify pequena",
      skills: ["shopify"],
      budgetMinCents: 100_000,
      budgetMaxCents: 200_000,
    });
    await project(owner, {
      title: "Loja Shopify com tema próprio",
      skills: ["shopify", "figma"],
      budgetMinCents: 500_000,
      budgetMaxCents: 900_000,
    });
    await project(owner, {
      title: "Telas do app no Figma",
      category: "design",
      skills: ["figma", "ui-design"],
    });
    const visitor = new Browser(app);

    const all = await projects(visitor);
    expect(all.total).toBe(3);
    expect(all.facets.categories).toEqual([
      { value: "desenvolvimento", count: 2 },
      { value: "design", count: 1 },
    ]);

    // A category narrows the results and the skill counts, but categories still count every one of them.
    const design = await projects(visitor, "?category=design");
    expect(titles(design)).toEqual(["Telas do app no Figma"]);
    expect(design.total).toBe(1);
    expect(design.facets.categories).toEqual(all.facets.categories);
    expect(design.facets.skills).toEqual([
      { value: "figma", count: 1 },
      { value: "ui-design", count: 1 },
    ]);

    // Skills: every one asked for.
    expect(titles(await projects(visitor, "?skills=shopify&skills=figma"))).toEqual([
      "Loja Shopify com tema próprio",
    ]);
    expect((await projects(visitor, "?skills=figma")).total).toBe(2);
    // Budget in reais: may pay at least R$ 3.000 / starts at most at R$ 1.500.
    expect(titles(await projects(visitor, "?minBudget=3000"))).toEqual([
      "Telas do app no Figma",
      "Loja Shopify com tema próprio",
    ]);
    expect(titles(await projects(visitor, "?maxBudget=1500"))).toEqual(["Loja Shopify pequena"]);
    // Empty fields from a plain form are no filter.
    expect((await projects(visitor, "?q=&category=&minBudget=&sort=")).total).toBe(3);
    expect((await visitor.get("/api/projects?minBudget=muito")).statusCode).toBe(400);
  });

  it("pages without repeats in every order; relevance and keyset cursors don't mix", async () => {
    const owner = await person(app, ["client"]);
    for (let n = 0; n < 23; n++) {
      // Pairs share an instant and a budget: the id breaks ties.
      if (n % 2 === 0) clock.advance(1000);
      await publishProject(owner, { budgetMinCents: 100_000, budgetMaxCents: 200_000 + (n % 5) * 100_000 });
    }
    const visitor = new Browser(app);
    for (const sort of ["recent", "budget", "relevance"]) {
      const query = sort === "relevance" ? "?q=loja&sort=relevance" : `?sort=${sort}`;
      const first = await projects(visitor, query);
      expect(first.items).toHaveLength(SEARCH_PAGE_SIZE);
      const second = await projects(visitor, `${query}&cursor=${first.next}`);
      expect(second.next).toBeNull();
      const ids = [...first.items, ...second.items].map((p) => p.id);
      expect(new Set(ids).size).toBe(23);
      if (sort === "budget") {
        const budgets = [...first.items, ...second.items].map((p) => p.budgetMaxCents);
        expect(budgets).toEqual([...budgets].sort((a, b) => b - a));
      }
    }
    const recent = await projects(visitor, "?sort=recent");
    expect((await visitor.get(`/api/projects?sort=budget&cursor=${recent.next}`)).json().error.code).toBe(
      "invalid_cursor",
    );
    expect((await visitor.get("/api/projects?cursor=bm9wZQ")).statusCode).toBe(400);
    // Relevance without words is just newest first.
    expect((await projects(visitor, "?sort=relevance")).sort).toBe("recent");
  });

  it("stops relevance paging after the last allowed page", async () => {
    const owner = await person(app, ["client"]);
    const now = clock.now();
    await db.project.createMany({
      data: Array.from({ length: SEARCH_MAX_PAGES * SEARCH_PAGE_SIZE + 5 }, (_, n) => ({
        id: uuidv7(now.getTime() + n),
        clientId: owner.id,
        title: `Loja virtual número ${n}`,
        description: PROJECT.description,
        category: "desenvolvimento",
        skills: ["shopify"],
        budgetMinCents: 100_000n,
        budgetMaxCents: 200_000n,
        status: "open" as const,
        publishedAt: now,
      })),
    });
    const visitor = new Browser(app);
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 1; page <= SEARCH_MAX_PAGES; page++) {
      const results: ProjectResults = await projects(visitor, `?q=loja${cursor ? `&cursor=${cursor}` : ""}`);
      for (const item of results.items) seen.add(item.id);
      cursor = results.next;
      if (page < SEARCH_MAX_PAGES) expect(cursor).not.toBeNull();
    }
    expect(cursor).toBeNull();
    expect(seen.size).toBe(SEARCH_MAX_PAGES * SEARCH_PAGE_SIZE);
    // Newest first still pages through every one of them.
    expect((await projects(visitor, "?q=loja")).total).toBe(SEARCH_MAX_PAGES * SEARCH_PAGE_SIZE + 5);
  });

  it("never finds another visitor's projects, hidden ones or a suspended client's", async () => {
    const sandboxes = app.get(Sandboxes);
    const [a, b] = [await sandboxes.create(), await sandboxes.create()];
    const visitorA = await person(app, ["client"], { sandboxId: a });
    const visitorB = await person(app, ["client"], { sandboxId: b });
    await project(visitorA, { title: "Sistema de orçamentos para marcenaria" });
    const seeded = await person(app, ["client"]);
    await project(seeded, { title: "Catálogo online de marcenaria planejada" });

    const look = (who: Browser) => projects(who, "?q=marcenaria");
    expect(titles(await look(visitorA.browser))).toHaveLength(2);
    for (const other of [visitorB.browser, new Browser(app)]) {
      const results = await look(other);
      expect(titles(results)).toEqual(["Catálogo online de marcenaria planejada"]);
      expect(results.total).toBe(1);
      expect(results.facets.categories).toEqual([{ value: "desenvolvimento", count: 1 }]);
    }

    const hidden = await project(seeded, { title: "Móveis sob medida: site da marcenaria" });
    await db.project.update({ where: { id: hidden.id }, data: { hiddenAt: clock.now() } });
    expect((await look(new Browser(app))).total).toBe(1);
    await db.user.update({ where: { id: seeded.id }, data: { suspendedAt: clock.now() } });
    expect((await look(new Browser(app))).total).toBe(0);
  });
});

describe("freelancer search", () => {
  it("ranks by Bayesian reputation: a lucky single 5 doesn't beat many 4.8s", async () => {
    const steady = await freelancer({}, { name: "Constante" });
    const lucky = await freelancer({}, { name: "Sortuda" });
    await freelancer({}, { name: "Novata" });
    const shaky = await freelancer({}, { name: "Instável" });
    await rated(steady, [5, 5, 5, 5, 5, 5, 5, 5, 4, 4]); // 4.8 from 10
    await rated(lucky, [5]);
    await rated(shaky, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    const visitor = new Browser(app);

    const results = await freelancers(visitor, "?sort=rating");
    expect(results.items.map((f) => f.name)).toEqual(["Constante", "Sortuda", "Novata", "Instável"]);
    expect(results.items[0]!.reputation).toEqual({ count: 10, average: 4.8 });
    expect(results.items[2]!.reputation).toEqual({ count: 0, average: null });

    // The same order as the shared formula, with the marketplace's mean as the prior.
    const reps = results.items.map((f) => f.reputation);
    const mean =
      reps.reduce((s, r) => s + r.count * (r.average ?? 0), 0) / reps.reduce((s, r) => s + r.count, 0);
    const scores = reps.map((r) => bayesian(r, { mean }));
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    // Relevance without words is reputation too.
    expect((await freelancers(visitor)).items.map((f) => f.name)).toEqual(results.items.map((f) => f.name));
  });

  it("ranks relevance × reputation: the match decides what's about the words, reputation among them", async () => {
    const exact = await freelancer(
      { headline: "Identidade visual para marcas", skills: ["identidade-visual"] },
      { name: "Título" },
    );
    const mention = await freelancer(
      {
        headline: "Designer de interfaces",
        bio: "Faço telas e, às vezes, um pouco de identidade visual também.",
        category: "design",
        skills: ["figma"],
      },
      { name: "Menção" },
    );
    const other = await freelancer(
      {
        headline: "Edição de vídeo",
        bio: "Edito vídeos curtos para redes sociais há anos.",
        category: "video",
        skills: ["edicao-video"],
      },
      { name: "Vídeo" },
    );
    await rated(mention, [5, 5]);
    await rated(exact, [4, 4]);
    await rated(other, [5, 5, 5]);
    const visitor = new Browser(app);

    const results = await freelancers(visitor, "?q=identidade+visual");
    expect(results.items.map((f) => f.name)).toEqual(["Título", "Menção"]);
    expect(results.sort).toBe("relevance");
    // Equal text: the better reputation first.
    await db.freelancerProfile.update({
      where: { userId: exact.id },
      data: {
        skills: ["figma"],
        headline: "Designer de interfaces",
        bio: "Faço telas e, às vezes, um pouco de identidade visual também.",
      },
    });
    expect((await freelancers(visitor, "?q=identidade+visual")).items.map((f) => f.name)).toEqual([
      "Menção",
      "Título",
    ]);
  });

  it("filters by budget, rating as shown, availability and skills, with facets", async () => {
    const cheap = await freelancer({ minBudgetCents: 50_000, skills: ["wordpress"] }, { name: "Barata" });
    const pricey = await freelancer(
      { minBudgetCents: 800_000, skills: ["shopify", "wordpress"] },
      { name: "Cara" },
    );
    const busy = await freelancer(
      { available: false, category: "design", skills: ["figma"] },
      { name: "Ocupada" },
    );
    await rated(cheap, [5, 4]); // 4.5 shown
    await rated(pricey, [...Array(9).fill(5), ...Array(11).fill(4)]); // 4.45, shown as 4.5
    await rated(busy, [3]);
    const visitor = new Browser(app);
    const names = async (query: string) =>
      (await freelancers(visitor, query)).items.map((f) => f.name).sort();

    expect(await names("?budget=1000")).toEqual(["Barata", "Ocupada"]);
    expect(await names("?minRating=4.5")).toEqual(["Barata", "Cara"]);
    expect(await names("?minRating=4.6")).toEqual([]);
    expect(await names("?minRating=4")).toEqual(["Barata", "Cara"]);
    expect(await names("?available=1")).toEqual(["Barata", "Cara"]);
    expect(await names("?skills=wordpress&skills=shopify")).toEqual(["Cara"]);

    const dev = await freelancers(visitor, "?category=desenvolvimento");
    expect(dev.total).toBe(2);
    expect(dev.facets.categories).toEqual([
      { value: "desenvolvimento", count: 2 },
      { value: "design", count: 1 },
    ]);
    expect(dev.facets.skills).toEqual([
      { value: "wordpress", count: 2 },
      { value: "shopify", count: 1 },
    ]);
  });

  it("pages by price without repeats", async () => {
    for (let n = 0; n < 23; n++) await freelancer({ minBudgetCents: 50_000 + (n % 4) * 10_000 });
    const visitor = new Browser(app);
    const first = await freelancers(visitor, "?sort=price");
    const second = await freelancers(visitor, `?sort=price&cursor=${first.next}`);
    const all = [...first.items, ...second.items];
    expect(new Set(all.map((f) => f.id)).size).toBe(23);
    expect(second.next).toBeNull();
    const prices = all.map((f) => f.minBudgetCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("keeps sandboxes apart: profiles, and reviews that move the ranking", async () => {
    const sandboxes = app.get(Sandboxes);
    const [a, b] = [await sandboxes.create(), await sandboxes.create()];
    const seededTop = await freelancer({}, { name: "Semeada Alta" });
    const seededLow = await freelancer({}, { name: "Semeada Baixa" });
    await rated(seededTop, [5, 5, 5]);
    await rated(seededLow, [4, 4, 4]);
    await freelancer({}, { name: "Visitante A", sandboxId: a });
    const visitorA = await person(app, ["client"], { sandboxId: a });
    const visitorB = await person(app, ["client"], { sandboxId: b });
    // Visitor A hires the lower one and rates her 5, again and again: those reviews stay in A's sandbox,
    // and count for no one (not even in the mean that ranks everyone).
    for (let n = 0; n < 8; n++) await sandboxReview(visitorA, seededLow, a, 5);

    for (const viewer of [visitorA.browser, visitorB.browser, new Browser(app)]) {
      const results = await freelancers(viewer, "?sort=rating");
      const names = results.items.map((f) => f.name);
      expect(names.filter((name) => name.startsWith("Semeada"))).toEqual(["Semeada Alta", "Semeada Baixa"]);
      expect(results.items.find((f) => f.name === "Semeada Baixa")!.reputation).toEqual({
        count: 3,
        average: 4,
      });
      expect(names.includes("Visitante A")).toBe(viewer === visitorA.browser);
      expect(results.total).toBe(viewer === visitorA.browser ? 3 : 2);
    }
  });
});

describe("search over the seeded marketplace", () => {
  it("finds people and projects by what they'd type", async () => {
    await seedMarketplace(db);
    const visitor = new Browser(app);
    expect((await freelancers(visitor, "?q=trafego")).items[0]!.headline).toBe(
      "Tráfego pago e SEO para e-commerce",
    );
    const coffee = await projects(visitor, "?q=cafe");
    expect(titles(coffee)).toEqual(
      expect.arrayContaining([
        "Loja Shopify com assinatura mensal de café",
        "Rótulos para a nova linha de cafés especiais",
      ]),
    );
    expect((await projects(visitor, "?q=ilustracao")).items.length).toBeGreaterThan(0);
  });
});

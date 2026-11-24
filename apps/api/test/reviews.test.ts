import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ContractReviews, Page, PublicFreelancer, ReviewView } from "@lance/shared";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { Sandboxes } from "../src/sandbox/sandboxes.service.ts";
import { Scheduler } from "../src/scheduler/scheduler.service.ts";
import { seedId, seedMarketplace } from "../src/seed/seed.ts";
import { FakeClock } from "../src/time/clock.ts";
import { Browser, completed, emailsTo, hire, person, resetDb, testApp } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
afterAll(() => app.close());
beforeEach(() => resetDb(db));

const DAY = 24 * 3_600_000;
type Someone = Awaited<ReturnType<typeof person>>;

const review = (who: Someone, contractId: string, rating = 5, comment = "Trabalho impecável, recomendo.") =>
  who.browser.post(`/api/contracts/${contractId}/reviews`, { rating, comment });
const reviewsOf = async (who: Someone, contractId: string) =>
  (await who.browser.get(`/api/contracts/${contractId}/reviews`)).json() as ContractReviews;
const publicReviews = async (viewer: Browser, freelancerId: string) =>
  ((await viewer.get(`/api/freelancers/${freelancerId}/reviews`)).json() as Page<ReviewView>).items;
const reputation = async (viewer: Browser, freelancerId: string) =>
  ((await viewer.get(`/api/freelancers/${freelancerId}`)).json() as PublicFreelancer).reputation;

describe("reviews", () => {
  it("open only when the contract is completed, for its two people, once each", async () => {
    const { client, freelancer, contractId } = await hire(app);
    expect((await review(client, contractId)).json().error.code).toBe("not_reviewable");
    await db.contract.update({ where: { id: contractId }, data: {} });

    const done = await completed(app);
    expect((await review(done.client, done.contractId)).statusCode).toBe(201);
    expect((await review(done.client, done.contractId)).json().error.code).toBe("already_reviewed");
    expect((await review(freelancer, done.contractId)).statusCode).toBe(404);
    expect(
      (
        await done.client.browser.post(`/api/contracts/${done.contractId}/reviews`, {
          rating: 6,
          comment: "x",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("are double-blind: hidden from everyone but the author until both wrote", async () => {
    const { client, freelancer, contractId } = await completed(app);
    await review(client, contractId, 4, "Entregou no prazo, comunicação ótima.");

    expect(await reviewsOf(client, contractId)).toMatchObject({
      canReview: false,
      mine: { rating: 4 },
      theirs: null,
    });
    expect(await reviewsOf(freelancer, contractId)).toMatchObject({
      canReview: true,
      theirs: null,
      theirsWaiting: true,
    });
    const visitor = new Browser(app);
    expect(await publicReviews(visitor, freelancer.id)).toEqual([]);
    expect(await reputation(visitor, freelancer.id)).toEqual({ count: 0, average: null });

    await review(freelancer, contractId, 5, "Cliente claro e pagou cada etapa em dia.");
    expect(await reviewsOf(freelancer, contractId)).toMatchObject({
      theirs: { rating: 4 },
      theirsWaiting: false,
    });
    expect((await publicReviews(visitor, freelancer.id)).map((r) => r.comment)).toEqual([
      "Entregou no prazo, comunicação ótima.",
    ]);
    expect(await reputation(visitor, freelancer.id)).toEqual({ count: 1, average: 4 });
  });

  it("reveal a lone review when the 14 days are over, and then close", async () => {
    const { client, freelancer, contractId } = await completed(app);
    await review(client, contractId, 3, "Bom resultado, mas atrasou a segunda etapa.");
    clock.advance(14 * DAY - 1000);
    expect(await publicReviews(new Browser(app), freelancer.id)).toEqual([]);

    clock.advance(2000);
    expect((await publicReviews(new Browser(app), freelancer.id)).map((r) => r.rating)).toEqual([3]);
    expect(await reviewsOf(client, contractId)).toMatchObject({ canReview: false });
    expect((await review(freelancer, contractId)).json().error.code).toBe("review_window_closed");
  });

  it("can't be edited, even directly in the database (only moderation can hide them)", async () => {
    const { client, contractId } = await completed(app);
    await review(client, contractId);
    await expect(db.review.updateMany({ data: { rating: 1 } })).rejects.toThrow(/cannot be edited/);
    await db.review.updateMany({ data: { hiddenAt: clock.now() } });
    expect((await reviewsOf(client, contractId)).mine).toBeNull();
  });
});

describe("the reveal emails", () => {
  it("go out once: on the second review, and the window closing then adds nothing", async () => {
    const { client, freelancer, contractId } = await completed(app);
    const emailOf = async (who: Someone) =>
      (await db.user.findUniqueOrThrow({ where: { id: who.id } })).email;
    const kinds = async (who: Someone) => (await emailsTo(app, await emailOf(who))).map((e) => e.kind);
    expect(await kinds(client)).toContain("review_requested");

    await review(client, contractId);
    await review(freelancer, contractId);
    clock.advance(15 * DAY);
    await app.get(Scheduler).runOnce();
    for (const who of [client, freelancer]) {
      expect((await kinds(who)).filter((kind) => kind.startsWith("review")).sort()).toEqual([
        "review_requested",
        "reviews_revealed",
      ]);
      expect(
        (await kinds(who)).filter((kind) => kind === "reviews_revealed" || kind === "review_revealed"),
      ).toEqual(["reviews_revealed"]);
    }
  });

  it("tell the reviewee about a lone review when the window closes", async () => {
    const { client, freelancer, contractId } = await completed(app);
    await review(client, contractId);
    clock.advance(15 * DAY);
    await app.get(Scheduler).runOnce();
    const email = (await db.user.findUniqueOrThrow({ where: { id: freelancer.id } })).email;
    expect((await emailsTo(app, email)).filter((e) => e.kind === "review_revealed")).toHaveLength(1);
  });
});

describe("reputation", () => {
  it("counts only reviews from the person's own corner of the marketplace", async () => {
    await seedMarketplace(db);
    const marina = seedId("marina-costa");
    const before = await reputation(new Browser(app), marina);
    expect(before.count).toBeGreaterThan(0);

    // A demo visitor hires the seeded freelancer and rates her 1 star: her public numbers don't move.
    const sandbox = await app.get(Sandboxes).create();
    const visitor = await person(app, ["client"], { sandboxId: sandbox });
    await db.contract.create({
      data: {
        id: "01a20000-0000-7000-8000-00000000c0de",
        projectId: (
          await db.project.create({
            data: {
              id: "01a20000-0000-7000-8000-00000000beef",
              clientId: visitor.id,
              sandboxId: sandbox,
              title: "Projeto da visita",
              description: "Um projeto criado por um visitante da demonstração.",
              category: "design",
              skills: ["figma"],
              budgetMinCents: 10_000n,
              budgetMaxCents: 20_000n,
              status: "completed",
            },
          })
        ).id,
        proposalId: (
          await db.proposal.create({
            data: {
              id: "01a20000-0000-7000-8000-0000000cafe1",
              projectId: "01a20000-0000-7000-8000-00000000beef",
              freelancerId: marina,
              sandboxId: sandbox,
              coverLetter: "Proposta para a visita da demonstração.",
              deliveryDays: 5,
              milestones: [],
              priceCents: 10_000n,
              status: "accepted",
              submittedAt: clock.now(),
            },
          })
        ).id,
        clientId: visitor.id,
        freelancerId: marina,
        sandboxId: sandbox,
        priceCents: 10_000n,
        feeBps: 1000,
        autoReleaseHours: 168,
        status: "completed",
        completedAt: clock.now(),
      },
    });
    expect(
      (await review(visitor, "01a20000-0000-7000-8000-00000000c0de", 1, "Não gostei do resultado final."))
        .statusCode,
    ).toBe(201);
    clock.advance(15 * DAY);
    expect(await reputation(new Browser(app), marina)).toEqual(before);
    expect(await reputation(visitor.browser, marina)).toEqual(before);
  });
});

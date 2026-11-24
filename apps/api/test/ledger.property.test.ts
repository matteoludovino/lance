import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { Milestones } from "../src/contracts/milestones.service.ts";
import { reconcile } from "../src/ledger/reconciliation.ts";
import { PrismaService } from "../src/prisma/prisma.service.ts";
import { FakeClock } from "../src/time/clock.ts";
import { admin, hire, resetDb, testApp } from "./support.ts";

const clock = new FakeClock();
const app = await testApp({}, { clock });
const db = app.get(PrismaService);
const milestones = app.get(Milestones);
afterAll(() => app.close());

const HOUR = 3_600_000;
const ACTIONS = [
  "fund",
  "submit",
  "approve",
  "revise",
  "dispute_client",
  "dispute_freelancer",
  "cancel_client",
  "cancel_freelancer",
  "resolve_release",
  "resolve_refund",
  "wait",
] as const;
type Action = (typeof ACTIONS)[number];

const step = fc.record({ action: fc.constantFrom(...ACTIONS), milestone: fc.nat({ max: 2 }) });
/** A scenario: batches of one to three actions; the actions in a batch run at the same time. */
const scenario = fc.array(fc.array(step, { minLength: 1, maxLength: 3 }), { minLength: 4, maxLength: 14 });

describe("the ledger under any sequence of actions", () => {
  it("always reconciles: zero-sum, balances equal entries, escrow matches each state, one movement per kind", async () => {
    await fc.assert(
      fc.asyncProperty(scenario, async (batches) => {
        await resetDb(db);
        const {
          client,
          freelancer,
          contractId,
          milestones: ids,
        } = await hire(app, {
          milestones: [
            { title: "Primeira etapa", amountCents: 100_001 },
            { title: "Segunda etapa", amountCents: 33_333 },
            { title: "Terceira etapa", amountCents: 250_000 },
          ],
        });
        const boss = await admin(app);
        const run = async ({ action, milestone }: { action: Action; milestone: number }) => {
          const id = ids[milestone]!;
          const post = (who: typeof client, path: string, body?: object) =>
            who.browser.post(`/api/${path}`, body).then((response) => response.statusCode);
          switch (action) {
            case "fund":
              return post(client, `milestones/${id}/fund`);
            case "submit":
              return post(freelancer, `milestones/${id}/submit`, {
                note: "Entrega feita conforme combinado.",
              });
            case "approve":
              return post(client, `milestones/${id}/approve`);
            case "revise":
              return post(client, `milestones/${id}/request-revision`, {
                note: "Ajuste os textos, por favor.",
              });
            case "dispute_client":
            case "dispute_freelancer":
              return post(action === "dispute_client" ? client : freelancer, `milestones/${id}/dispute`, {
                reason: "Não chegamos a um acordo sobre esta etapa.",
              });
            case "cancel_client":
            case "cancel_freelancer":
              return post(action === "cancel_client" ? client : freelancer, `milestones/${id}/cancel`);
            case "resolve_release":
            case "resolve_refund":
              return post(boss, `admin/milestones/${id}/resolve`, {
                outcome: action === "resolve_release" ? "release" : "refund",
              });
            case "wait":
              clock.advance(100 * HOUR);
              await milestones.releaseDue(clock.now());
              return 200;
          }
        };
        for (const batch of batches) {
          const answers = await Promise.all(batch.map(run));
          // Refusals (403/409) are expected along the way; a server error never is.
          expect(answers.every((status) => status < 500)).toBe(true);
        }

        expect(await reconcile(db)).toEqual([]);
        const contract = await db.contract.findUniqueOrThrow({
          where: { id: contractId },
          include: { milestones: true },
        });
        const settled = contract.milestones.every((m) =>
          ["released", "refunded", "cancelled"].includes(m.status),
        );
        const paid = contract.milestones.some((m) => m.status === "released");
        expect(contract.status).toBe(settled ? (paid ? "completed" : "cancelled") : "active");
        // Money in = money out + money held.
        const external = await db.ledgerAccount.findFirst({ where: { kind: "external" } });
        const held = contract.milestones
          .filter((m) => ["funded", "submitted", "revision_requested", "disputed"].includes(m.status))
          .reduce((sum, m) => sum + m.amountCents, 0n);
        const released = contract.milestones
          .filter((m) => m.status === "released")
          .reduce((sum, m) => sum + m.amountCents, 0n);
        expect(-(external?.balanceCents ?? 0n)).toBe(held + released);
      }),
      { numRuns: 25 },
    );
  }, 300_000);
});

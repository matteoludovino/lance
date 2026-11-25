import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { uuidv7 } from "../common/ids.ts";
import { transaction } from "../common/transactions.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Scheduler } from "../scheduler/scheduler.service.ts";
import { Clock } from "../time/clock.ts";

export const SANDBOX_LIFETIME_MS = 24 * 60 * 60 * 1000;
const BATCH = 5;

/**
 * Demo sandboxes: a visitor's private corner of the marketplace, gone after a day. Removing one removes
 * everything written in it: its people (and through them their projects, proposals, contracts,
 * conversations, reviews and reports), its emails and outbox events, and its money and audit trail.
 */
@Injectable()
export class Sandboxes implements OnModuleInit {
  private readonly logger = new Logger("Sandboxes");

  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: "sandbox-expiry",
      run: (now) => this.expire(now),
      nextDueAt: async () =>
        (await this.db.sandbox.findFirst({ orderBy: { expiresAt: "asc" }, select: { expiresAt: true } }))
          ?.expiresAt ?? null,
    });
  }

  async create(): Promise<string> {
    const now = this.clock.now();
    const { id } = await this.db.sandbox.create({
      data: {
        id: uuidv7(now.getTime()),
        createdAt: now,
        expiresAt: new Date(now.getTime() + SANDBOX_LIFETIME_MS),
      },
    });
    return id;
  }

  /** Sandboxes still alive: the demo's global cap counts these. */
  active(now = this.clock.now()): Promise<number> {
    return this.db.sandbox.count({ where: { expiresAt: { gt: now } } });
  }

  /** Removes the sandboxes whose day is over. */
  async expire(now: Date): Promise<number> {
    const due = await this.db.sandbox.findMany({
      where: { expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: BATCH,
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        await this.remove(id);
      } catch (error) {
        this.logger.error(`removing sandbox ${id} failed: ${error instanceof Error ? error.message : error}`);
        return 0; // try again on the next sweep, rather than spinning on the same one
      }
    }
    return due.length;
  }

  /**
   * One transaction. The ledger and the audit log refuse deletes except under their purge settings,
   * set here for this transaction only; a sandbox's ledger transactions never involve another
   * sandbox's accounts, so whole, balanced transactions go. Then the sandbox itself: the rest cascades.
   */
  async remove(id: string): Promise<void> {
    await transaction(this.db, async (tx) => {
      await tx.$executeRaw`SELECT set_config('lance.ledger_purge', 'on', true)`;
      await tx.$executeRaw`SELECT set_config('lance.purge', 'on', true)`;
      await tx.$executeRaw`DELETE FROM ledger_entries WHERE "transactionId" IN
        (SELECT id FROM ledger_transactions WHERE "sandboxId" = ${id}::uuid)`;
      await tx.$executeRaw`DELETE FROM ledger_transactions WHERE "sandboxId" = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM ledger_accounts WHERE "sandboxId" = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM audit_entries WHERE "sandboxId" = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM reports WHERE "sandboxId" = ${id}::uuid`;
      await tx.$executeRaw`DELETE FROM idempotency_keys WHERE "userId" IN
        (SELECT id FROM users WHERE "sandboxId" = ${id}::uuid)`;
      await tx.sandbox.delete({ where: { id } });
    });
  }
}

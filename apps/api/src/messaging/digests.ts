import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ENV, type Env } from "../env.ts";
import { Mailer } from "../mail/mailer.service.ts";
import { messageDigest } from "../mail/templates.ts";
import { OutboxService, type Tx } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Scheduler } from "../scheduler/scheduler.service.ts";
import { transaction } from "../common/transactions.ts";

/** How long a message may sit unread before its recipient gets an email about it. */
export const DIGEST_DELAY_MS = 10 * 60_000;
const DIGEST = "messages.digest";
const BATCH = 20;

/**
 * Queues an unread-messages email for the recipient of a new message, in the sending transaction. At
 * most one waits per person and conversation, due 10 minutes after the first unread message: a burst
 * of messages makes one email, not one per message.
 */
export async function queueDigest(
  tx: Tx,
  {
    userId,
    conversationId,
    sandboxId,
    now,
  }: { userId: string; conversationId: string; sandboxId: string | null; now: Date },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO pending_digests ("userId", "conversationId", "dueAt", "sandboxId")
    VALUES (${userId}::uuid, ${conversationId}::uuid, ${new Date(now.getTime() + DIGEST_DELAY_MS)}, ${sandboxId}::uuid)
    ON CONFLICT DO NOTHING`;
}

/**
 * When a digest is due, it moves to the outbox (which retries delivery); the handler then sends it only
 * if something is still unread, saying how much and showing the latest message.
 */
@Injectable()
export class Digests implements OnModuleInit {
  private readonly logger = new Logger("Digests");

  constructor(
    private readonly db: PrismaService,
    private readonly scheduler: Scheduler,
    private readonly outbox: OutboxService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.scheduler.register({
      name: "message-digests",
      run: (now) => this.due(now),
      nextDueAt: async () =>
        (await this.db.pendingDigest.findFirst({ orderBy: { dueAt: "asc" }, select: { dueAt: true } }))
          ?.dueAt ?? null,
    });
    this.outbox.handle(DIGEST, (event) =>
      this.send(event.payload as { userId: string; conversationId: string }),
    );
  }

  /** Moves due digests to the outbox: claimed with SKIP LOCKED, so two sweeps never take the same one. */
  async due(now: Date): Promise<number> {
    const moved = await transaction(this.db, async (tx) => {
      const rows = await tx.$queryRaw<{ userId: string; conversationId: string; sandboxId: string | null }[]>`
        DELETE FROM pending_digests WHERE ("userId", "conversationId") IN (
          SELECT "userId", "conversationId" FROM pending_digests
          WHERE "dueAt" <= ${now} ORDER BY "dueAt" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
        RETURNING "userId", "conversationId", "sandboxId"`;
      for (const row of rows) {
        await this.outbox.add(
          tx,
          DIGEST,
          { userId: row.userId, conversationId: row.conversationId },
          { sandboxId: row.sandboxId },
        );
      }
      return rows.length;
    });
    if (moved > 0) this.outbox.committed();
    return moved;
  }

  private async send({ userId, conversationId }: { userId: string; conversationId: string }): Promise<void> {
    const conversation = await this.db.conversation.findUnique({
      where: { id: conversationId },
      include: { client: true, freelancer: true, project: { select: { title: true } } },
    });
    if (!conversation) return;
    const isClient = conversation.clientId === userId;
    const me = isClient ? conversation.client : conversation.freelancer;
    const other = isClient ? conversation.freelancer : conversation.client;
    const readSeq = isClient ? conversation.clientReadSeq : conversation.freelancerReadSeq;
    if (me.suspendedAt) return;
    const unread = await this.db.message.findMany({
      where: { conversationId, seq: { gt: readSeq }, senderId: { not: userId }, hiddenAt: null },
      orderBy: { seq: "desc" },
      select: { body: true },
    });
    if (unread.length === 0) return; // read in the meantime: nothing to say
    const count = unread.length;
    const project = conversation.project.title;
    const subject =
      count === 1
        ? `Mensagem não lida de ${other.name} sobre “${project}”`
        : `${count} mensagens não lidas de ${other.name} sobre “${project}”`;
    const latest = unread[0]!.body;
    const excerpt = latest.length > 160 ? `${latest.slice(0, 157).trimEnd()}…` : latest;
    await this.mailer.send(
      { userId: me.id, email: me.email, sandboxId: me.sandboxId },
      "message_digest",
      messageDigest(
        me.name,
        subject,
        count === 1
          ? `${other.name} mandou uma mensagem que você ainda não leu:`
          : `${other.name} mandou ${count} mensagens que você ainda não leu. A mais recente:`,
        excerpt,
        new URL(`/mensagens/${conversationId}`, this.env.WEB_URL).href,
      ),
    );
    this.logger.debug(`digest for ${userId} in ${conversationId}: ${count} unread`);
  }
}

import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { proposalInput } from "@lance/shared";
import { Conversations } from "../messaging/conversations.service.ts";
import { Proposals } from "../marketplace/proposals.service.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Clock } from "../time/clock.ts";
import { BOT_REPLIES, botProposal } from "./content.ts";
import { actor } from "./demo.service.ts";
import { BOT_DELAYS_MS, DEMO_EVENTS } from "./events.ts";

/**
 * The seeded marketplace, alive inside a demo: seeded freelancers propose on a visitor's new project,
 * and seeded people answer a visitor's messages. They act through the same services as anyone, as
 * themselves but inside the visitor's sandbox, so what they write stays there (and goes with it).
 * Whatever a visitor did meanwhile (closed the project, hired someone) simply makes them skip.
 */
@Injectable()
export class Bots implements OnModuleInit {
  private readonly logger = new Logger("Bots");

  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
    private readonly proposals: Proposals,
    private readonly conversations: Conversations,
    private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    this.outbox.handle(DEMO_EVENTS.projectPublished, async (event) => {
      const { projectId } = event.payload as { projectId: string };
      await this.schedule(projectId);
    });
    this.outbox.handle(DEMO_EVENTS.botProposal, async (event) => {
      const { projectId, botId, n } = event.payload as { projectId: string; botId: string; n: number };
      await this.propose(projectId, botId, n);
    });
    this.outbox.handle(DEMO_EVENTS.reply, async (event) => {
      const { conversationId, botId } = event.payload as { conversationId: string; botId: string };
      await this.reply(conversationId, botId);
    });
  }

  /** Up to three seeded freelancers, those of the project's category first, each a little later. */
  private async schedule(projectId: string): Promise<void> {
    const project = await this.db.project.findUnique({ where: { id: projectId } });
    if (!project?.sandboxId || project.status !== "open") return;
    const seeded = await this.db.freelancerProfile.findMany({
      where: { sandboxId: null, hiddenAt: null, available: true, user: { suspendedAt: null } },
      select: { userId: true, category: true, skills: true },
      orderBy: { userId: "asc" },
    });
    const score = (f: { category: string; skills: string[] }) =>
      (f.category === project.category ? 10 : 0) + f.skills.filter((s) => project.skills.includes(s)).length;
    const picked = seeded.sort((a, b) => score(b) - score(a)).slice(0, BOT_DELAYS_MS.proposals.length);
    const now = this.clock.now().getTime();
    await this.db.$transaction(async (tx) => {
      for (const [n, bot] of picked.entries()) {
        await this.outbox.add(
          tx,
          DEMO_EVENTS.botProposal,
          { projectId, botId: bot.userId, n },
          { dueAt: new Date(now + BOT_DELAYS_MS.proposals[n]!), sandboxId: project.sandboxId },
        );
      }
    });
    this.outbox.committed();
  }

  private async propose(projectId: string, botId: string, n: number): Promise<void> {
    const project = await this.db.project.findUnique({ where: { id: projectId } });
    const bot = await this.db.user.findUnique({ where: { id: botId }, include: { freelancerProfile: true } });
    if (!project?.sandboxId || project.status !== "open" || !bot?.freelancerProfile) return;
    const input = botProposal(
      { name: bot.name, headline: bot.freelancerProfile.headline },
      {
        title: project.title,
        budgetMinCents: Number(project.budgetMinCents),
        budgetMaxCents: Number(project.budgetMaxCents),
      },
      n,
    );
    try {
      await this.proposals.submit(
        actor(bot.id, bot.name, project.sandboxId),
        projectId,
        proposalInput.parse(input),
      );
    } catch (error) {
      // The visitor got there first (closed the project, hired someone): nothing to send.
      this.logger.debug(`bot proposal skipped: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Answers only if the visitor spoke last, and at most a few times per conversation. */
  private async reply(conversationId: string, botId: string): Promise<void> {
    const conversation = await this.db.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation?.sandboxId) return;
    const [last] = await this.db.message.findMany({
      where: { conversationId, hiddenAt: null },
      orderBy: { seq: "desc" },
      take: 1,
      select: { senderId: true },
    });
    if (!last || last.senderId === botId) return;
    const said = await this.db.message.count({ where: { conversationId, senderId: botId } });
    const text = BOT_REPLIES[said];
    if (!text) return;
    const bot = await this.db.user.findUniqueOrThrow({ where: { id: botId }, select: { name: true } });
    await this.conversations.send(actor(botId, bot.name, conversation.sandboxId), conversationId, {
      clientId: crypto.randomUUID(),
      body: text,
    });
  }
}

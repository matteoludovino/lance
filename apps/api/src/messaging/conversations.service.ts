import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  detectContact,
  type ConversationSummary,
  type ConversationView,
  type MessageView,
  type SentMessage,
} from "@lance/shared";
import type { AuthUser } from "../auth/auth-user.ts";
import { uuidv7 } from "../common/ids.ts";
import { isUniqueViolation, transaction } from "../common/transactions.ts";
import type { Message, Prisma } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { reportFlaggedMessage } from "../moderation/reports.service.ts";
import { Hub } from "../realtime/hub.ts";
import { Scheduler } from "../scheduler/scheduler.service.ts";
import { visibleTo } from "../sandbox/scope.ts";
import { Clock } from "../time/clock.ts";
import { queueDigest } from "./digests.ts";

const PAGE = 50;
const NOT_FOUND = { code: "not_found", message: "Conversa não encontrada." };

const include = {
  project: { select: { id: true, title: true, contract: { select: { id: true, freelancerId: true } } } },
  client: { select: { id: true, name: true } },
  freelancer: { select: { id: true, name: true } },
} satisfies Prisma.ConversationInclude;

type Row = Prisma.ConversationGetPayload<{ include: typeof include }>;

/**
 * Conversations between a client and a freelancer about a project. A message is written over REST: the
 * conversation's counter gives it the next number (the row lock makes numbers gapless and in commit
 * order), the browser's id makes a resend harmless, and only after commit is it pushed to both people.
 */
@Injectable()
export class Conversations {
  constructor(
    private readonly db: PrismaService,
    private readonly hub: Hub,
    private readonly clock: Clock,
    private readonly scheduler: Scheduler,
  ) {}

  async list(user: AuthUser): Promise<ConversationSummary[]> {
    const rows = await this.db.conversation.findMany({
      where: { OR: [{ clientId: user.id }, { freelancerId: user.id }] },
      include: { ...include, messages: { where: { hiddenAt: null }, orderBy: { seq: "desc" }, take: 1 } },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    });
    return rows.map((row) => summary(user, row, row.messages[0] ?? null));
  }

  async unread(user: AuthUser): Promise<number> {
    const rows = await this.db.conversation.findMany({
      where: { OR: [{ clientId: user.id }, { freelancerId: user.id }] },
      select: { clientId: true, lastSeq: true, clientReadSeq: true, freelancerReadSeq: true },
    });
    return rows.reduce(
      (total, row) =>
        total + row.lastSeq - (row.clientId === user.id ? row.clientReadSeq : row.freelancerReadSeq),
      0,
    );
  }

  /** A conversation with its latest messages, or those before `before`, or (catching up) after `after`. */
  async view(
    user: AuthUser,
    id: string,
    page: { before?: number; after?: number } = {},
  ): Promise<ConversationView> {
    const row = await this.member(user, id);
    const where: Prisma.MessageWhereInput = { conversationId: id, hiddenAt: null };
    let messages: Message[];
    let hasOlder: boolean;
    if (page.after !== undefined) {
      messages = await this.db.message.findMany({
        where: { ...where, seq: { gt: page.after } },
        orderBy: { seq: "asc" },
        take: 200,
      });
      hasOlder = false;
    } else {
      const newestFirst = await this.db.message.findMany({
        where: { ...where, ...(page.before !== undefined ? { seq: { lt: page.before } } : {}) },
        orderBy: { seq: "desc" },
        take: PAGE + 1,
      });
      hasOlder = newestFirst.length > PAGE;
      messages = newestFirst.slice(0, PAGE).reverse();
    }
    const isClient = row.clientId === user.id;
    return {
      ...summary(user, row, null),
      lastMessage: null,
      lastSeq: row.lastSeq,
      myReadSeq: isClient ? row.clientReadSeq : row.freelancerReadSeq,
      otherReadSeq: isClient ? row.freelancerReadSeq : row.clientReadSeq,
      contractId: contractBetween(row),
      messages: messages.map(messageView),
      hasOlder,
    };
  }

  async send(user: AuthUser, id: string, input: { clientId: string; body: string }): Promise<SentMessage> {
    const row = await this.member(user, id);
    const flags = contractBetween(row) ? [] : detectContact(input.body);
    const isClient = row.clientId === user.id;
    let fresh = false;
    let message: Message;
    try {
      message = await transaction(this.db, async (tx) => {
        const earlier = await tx.message.findUnique({
          where: { senderId_clientMessageId: { senderId: user.id, clientMessageId: input.clientId } },
        });
        if (earlier) return this.resent(earlier, id);
        const now = this.clock.now();
        // Takes the row lock until commit: the next sender waits, so numbers follow commit order.
        const [counter] = isClient
          ? await tx.$queryRaw<{ seq: number }[]>`
              UPDATE conversations SET "lastSeq" = "lastSeq" + 1, "lastMessageAt" = ${now},
                "clientReadSeq" = "lastSeq" + 1
              WHERE id = ${id}::uuid RETURNING "lastSeq" AS seq`
          : await tx.$queryRaw<{ seq: number }[]>`
              UPDATE conversations SET "lastSeq" = "lastSeq" + 1, "lastMessageAt" = ${now},
                "freelancerReadSeq" = "lastSeq" + 1
              WHERE id = ${id}::uuid RETURNING "lastSeq" AS seq`;
        fresh = true;
        const created = await tx.message.create({
          data: {
            id: uuidv7(now.getTime()),
            conversationId: id,
            seq: counter!.seq,
            senderId: user.id,
            clientMessageId: input.clientId,
            body: input.body,
            contactFlags: flags,
            createdAt: now,
          },
        });
        if (flags.length > 0) await reportFlaggedMessage(tx, created, row.sandboxId);
        await queueDigest(tx, {
          userId: isClient ? row.freelancerId : row.clientId,
          conversationId: id,
          sandboxId: row.sandboxId,
          now,
        });
        return created;
      });
      this.scheduler.kick();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // The same message sent twice at once: the other request wrote it.
      fresh = false;
      message = this.resent(
        await this.db.message.findUniqueOrThrow({
          where: { senderId_clientMessageId: { senderId: user.id, clientMessageId: input.clientId } },
        }),
        id,
      );
    }
    const view = messageView(message);
    if (fresh)
      this.hub.publish([row.clientId, row.freelancerId], {
        type: "message",
        conversationId: id,
        message: view,
      });
    return { message: view, warning: flags.length > 0 ? (flags as SentMessage["warning"]) : null };
  }

  /** Marks messages read up to `seq` (never backwards); the other person sees the receipt. */
  async read(user: AuthUser, id: string, seq: number): Promise<{ readSeq: number }> {
    const row = await this.member(user, id);
    const column = row.clientId === user.id ? "clientReadSeq" : "freelancerReadSeq";
    const [updated] = await this.db.$queryRawUnsafe<{ readSeq: number }[]>(
      `UPDATE conversations SET "${column}" = GREATEST("${column}", LEAST($1::int, "lastSeq"))
       WHERE id = $2::uuid RETURNING "${column}" AS "readSeq"`,
      seq,
      id,
    );
    this.hub.publish([row.clientId, row.freelancerId], {
      type: "read",
      conversationId: id,
      userId: user.id,
      seq: updated!.readSeq,
    });
    return { readSeq: updated!.readSeq };
  }

  /** A client starts a conversation with a freelancer about one of their open projects. */
  async invite(user: AuthUser, projectId: string, freelancerId: string): Promise<{ conversationId: string }> {
    const project = await this.db.project.findFirst({ where: { id: projectId, clientId: user.id } });
    if (!project) throw new NotFoundException({ code: "not_found", message: "Projeto não encontrado." });
    if (project.status !== "open") {
      throw new ConflictException({
        code: "project_not_open",
        message: "Só dá para convidar em projetos abertos.",
      });
    }
    if (freelancerId === user.id) {
      throw new ForbiddenException({ code: "own_project", message: "Você não pode se convidar." });
    }
    const freelancer = await this.db.freelancerProfile.findFirst({
      where: { userId: freelancerId, hiddenAt: null, user: { suspendedAt: null }, ...visibleTo(user) },
    });
    if (!freelancer)
      throw new NotFoundException({ code: "not_found", message: "Freelancer não encontrado." });
    const now = this.clock.now();
    const conversation = await this.db.conversation.upsert({
      where: { projectId_freelancerId: { projectId, freelancerId } },
      create: {
        id: uuidv7(now.getTime()),
        projectId,
        clientId: user.id,
        freelancerId,
        sandboxId: user.sandboxId ?? freelancer.sandboxId,
        createdAt: now,
      },
      update: {},
    });
    return { conversationId: conversation.id };
  }

  private async member(user: AuthUser, id: string): Promise<Row> {
    const row = await this.db.conversation.findFirst({
      where: { id, OR: [{ clientId: user.id }, { freelancerId: user.id }] },
      include,
    });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  /** A resend must name the same conversation as the first send. */
  private resent(message: Message, conversationId: string): Message {
    if (message.conversationId !== conversationId) {
      throw new ConflictException({
        code: "client_id_reused",
        message: "Este identificador de mensagem já foi usado.",
      });
    }
    return message;
  }
}

function contractBetween(row: Row): string | null {
  const contract = row.project.contract;
  return contract && contract.freelancerId === row.freelancerId ? contract.id : null;
}

function messageView(message: Message): MessageView {
  return {
    id: message.id,
    conversationId: message.conversationId,
    seq: message.seq,
    senderId: message.senderId,
    clientId: message.clientMessageId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

function summary(user: AuthUser, row: Row, last: Message | null): ConversationSummary {
  const isClient = row.clientId === user.id;
  return {
    id: row.id,
    project: { id: row.project.id, title: row.project.title },
    other: isClient ? row.freelancer : row.client,
    role: isClient ? "client" : "freelancer",
    lastMessage: last
      ? { body: last.body.slice(0, 140), fromMe: last.senderId === user.id, at: last.createdAt.toISOString() }
      : null,
    unread: row.lastSeq - (isClient ? row.clientReadSeq : row.freelancerReadSeq),
  };
}

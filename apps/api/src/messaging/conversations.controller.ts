import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import {
  inviteInput,
  messageInput,
  readInput,
  type ConversationSummary,
  type ConversationView,
  type SentMessage,
} from "@lance/shared";
import { z } from "zod";
import { CurrentUser, type AuthUser } from "../auth/auth-user.ts";
import { uuidParam } from "../common/params.ts";
import { RateLimiter } from "../common/rate-limiter.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { ENV, type Env } from "../env.ts";
import { Tickets } from "../realtime/tickets.ts";
import { Conversations } from "./conversations.service.ts";

const conversationId = uuidParam("Conversa não encontrada.");
const projectId = uuidParam("Projeto não encontrado.");
const paging = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
});

@Controller()
export class ConversationsController {
  constructor(
    private readonly conversations: Conversations,
    private readonly tickets: Tickets,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** A one-time pass for the WebSocket, and where to open it. */
  @Post("realtime/ticket")
  ticket(@CurrentUser() user: AuthUser): { ticket: string; url: string } {
    this.limiter.hit(`ticket:${user.id}`, { max: 30, windowMs: 60_000 });
    return {
      ticket: this.tickets.issue({ userId: user.id, sessionId: user.sessionId }),
      url: this.env.PUBLIC_WS_URL,
    };
  }

  @Get("conversations")
  list(@CurrentUser() user: AuthUser): Promise<ConversationSummary[]> {
    return this.conversations.list(user);
  }

  @Get("me/unread")
  async unread(@CurrentUser() user: AuthUser): Promise<{ total: number }> {
    return { total: await this.conversations.unread(user) };
  }

  @Get("conversations/:id")
  view(
    @CurrentUser() user: AuthUser,
    @Param("id", conversationId) id: string,
    @Query(new ZodPipe(paging)) page: z.infer<typeof paging>,
  ): Promise<ConversationView> {
    return this.conversations.view(user, id, page);
  }

  @Post("conversations/:id/messages")
  send(
    @CurrentUser() user: AuthUser,
    @Param("id", conversationId) id: string,
    @Body(new ZodPipe(messageInput)) body: z.infer<typeof messageInput>,
  ): Promise<SentMessage> {
    this.limiter.hit(`message:${user.id}`, { max: 60, windowMs: 60_000 });
    return this.conversations.send(user, id, body);
  }

  @Post("conversations/:id/read")
  read(
    @CurrentUser() user: AuthUser,
    @Param("id", conversationId) id: string,
    @Body(new ZodPipe(readInput)) body: z.infer<typeof readInput>,
  ): Promise<{ readSeq: number }> {
    return this.conversations.read(user, id, body.seq);
  }

  @Post("projects/:id/invite")
  invite(
    @CurrentUser() user: AuthUser,
    @Param("id", projectId) id: string,
    @Body(new ZodPipe(inviteInput)) body: z.infer<typeof inviteInput>,
  ): Promise<{ conversationId: string }> {
    return this.conversations.invite(user, id, body.freelancerId);
  }
}

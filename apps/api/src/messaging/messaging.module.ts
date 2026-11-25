import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.ts";
import { Gateway } from "../realtime/gateway.ts";
import { ConversationsController } from "./conversations.controller.ts";
import { Conversations } from "./conversations.service.ts";
import { Digests } from "./digests.ts";

/** Conversations over REST, pushed live over the WebSocket gateway; unread ones get a digest email. */
@Module({
  imports: [MailModule],
  controllers: [ConversationsController],
  providers: [Conversations, Gateway, Digests],
  exports: [Conversations],
})
export class MessagingModule {}

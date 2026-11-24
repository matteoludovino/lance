import { Module } from "@nestjs/common";
import { Gateway } from "../realtime/gateway.ts";
import { ConversationsController } from "./conversations.controller.ts";
import { Conversations } from "./conversations.service.ts";

/** Conversations over REST, pushed live over the WebSocket gateway. */
@Module({
  controllers: [ConversationsController],
  providers: [Conversations, Gateway],
})
export class MessagingModule {}

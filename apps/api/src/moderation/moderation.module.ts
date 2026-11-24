import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.ts";
import { ModerationController } from "./moderation.controller.ts";
import { ModerationEmails } from "./moderation-emails.ts";
import { Reports } from "./reports.service.ts";

@Module({
  imports: [MailModule],
  controllers: [ModerationController],
  providers: [Reports, ModerationEmails],
})
export class ModerationModule {}

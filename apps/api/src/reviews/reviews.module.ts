import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.ts";
import { ReviewEmails } from "./review-emails.ts";
import { ReviewsController } from "./reviews.controller.ts";
import { Reviews } from "./reviews.service.ts";

/** Double-blind reviews and the reputation they add up to. */
@Module({
  imports: [MailModule],
  controllers: [ReviewsController],
  providers: [Reviews, ReviewEmails],
})
export class ReviewsModule {}

import { Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module.ts";
import { MarketplaceEmails } from "./marketplace-emails.ts";
import { ProjectsController } from "./projects.controller.ts";
import { Projects } from "./projects.service.ts";
import { ProposalsController } from "./proposals.controller.ts";
import { Proposals } from "./proposals.service.ts";

/** Projects and proposals: the two sides meeting. */
@Module({
  imports: [MailModule],
  controllers: [ProjectsController, ProposalsController],
  providers: [Projects, Proposals, MarketplaceEmails],
  exports: [Projects, Proposals],
})
export class MarketplaceModule {}

import { Module } from "@nestjs/common";
import { Ledger } from "../ledger/ledger.service.ts";
import { MailModule } from "../mail/mail.module.ts";
import { ContractEmails } from "./contract-emails.ts";
import { ContractsController } from "./contracts.controller.ts";
import { Contracts } from "./contracts.service.ts";
import { Idempotency } from "./idempotency.ts";
import { Milestones } from "./milestones.service.ts";

/** Contracts, the milestone lifecycle and the simulated escrow ledger. */
@Module({
  imports: [MailModule],
  controllers: [ContractsController],
  providers: [Contracts, Milestones, Ledger, Idempotency, ContractEmails],
  exports: [Milestones, Ledger],
})
export class ContractsModule {}

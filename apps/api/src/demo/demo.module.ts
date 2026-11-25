import { Module } from "@nestjs/common";
import { AccountsModule } from "../auth/accounts.module.ts";
import { ContractsModule } from "../contracts/contracts.module.ts";
import { MarketplaceModule } from "../marketplace/marketplace.module.ts";
import { MessagingModule } from "../messaging/messaging.module.ts";
import { Bots } from "./bots.ts";
import { DemoController } from "./demo.controller.ts";
import { Demo } from "./demo.service.ts";

/** One-click demos and the seeded people who keep them lively. */
@Module({
  imports: [AccountsModule, MarketplaceModule, ContractsModule, MessagingModule],
  controllers: [DemoController],
  providers: [Demo, Bots],
})
export class DemoModule {}

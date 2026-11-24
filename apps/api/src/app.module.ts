import { type DynamicModule, Module } from "@nestjs/common";
import { AccountsModule } from "./auth/accounts.module.ts";
import { ENV, type Env } from "./env.ts";
import { ContractsModule } from "./contracts/contracts.module.ts";
import { MessagingModule } from "./messaging/messaging.module.ts";
import { ReviewsModule } from "./reviews/reviews.module.ts";
import { MarketplaceModule } from "./marketplace/marketplace.module.ts";
import { HealthController } from "./health/health.controller.ts";
import { CoreModule } from "./outbox/outbox.module.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";
import type { Clock } from "./time/clock.ts";

@Module({})
export class AppModule {
  /** The application, configured with an already-validated environment (tests pass their own). */
  static with(env: Env, { clock }: { clock?: Clock } = {}): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        PrismaModule,
        CoreModule.with(clock),
        AccountsModule,
        MarketplaceModule,
        ContractsModule,
        MessagingModule,
        ReviewsModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}

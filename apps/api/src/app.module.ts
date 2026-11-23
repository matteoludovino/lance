import { type DynamicModule, Module } from "@nestjs/common";
import { ENV, type Env } from "./env.ts";
import { HealthController } from "./health/health.controller.ts";
import { PrismaModule } from "./prisma/prisma.module.ts";

@Module({})
export class AppModule {
  /** The application, configured with an already-validated environment (tests pass their own). */
  static with(env: Env): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [PrismaModule],
      controllers: [HealthController],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}

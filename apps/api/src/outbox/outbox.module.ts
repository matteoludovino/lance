import { type DynamicModule, Global, Module } from "@nestjs/common";
import { Scheduler } from "../scheduler/scheduler.service.ts";
import { Clock } from "../time/clock.ts";
import { OutboxService } from "./outbox.service.ts";

/** Time, the scheduler and the outbox, shared by every feature module. Tests pass a clock of their own. */
@Global()
@Module({})
export class CoreModule {
  static with(clock: Clock = new Clock()): DynamicModule {
    return {
      module: CoreModule,
      providers: [{ provide: Clock, useValue: clock }, Scheduler, OutboxService],
      exports: [Clock, Scheduler, OutboxService],
    };
  }
}

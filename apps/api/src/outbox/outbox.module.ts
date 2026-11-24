import { type DynamicModule, Global, Module } from "@nestjs/common";
import { Hub } from "../realtime/hub.ts";
import { Tickets } from "../realtime/tickets.ts";
import { RateLimiter } from "../common/rate-limiter.ts";
import { Scheduler } from "../scheduler/scheduler.service.ts";
import { Clock } from "../time/clock.ts";
import { OutboxService } from "./outbox.service.ts";

/** Time, the scheduler, the outbox, rate limits and who is connected, shared by every feature module. Tests pass a clock of their own. */
@Global()
@Module({})
export class CoreModule {
  static with(clock: Clock = new Clock()): DynamicModule {
    return {
      module: CoreModule,
      providers: [{ provide: Clock, useValue: clock }, Scheduler, OutboxService, RateLimiter, Hub, Tickets],
      exports: [Clock, Scheduler, OutboxService, RateLimiter, Hub, Tickets],
    };
  }
}

import "reflect-metadata";
import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.ts";
import { ErrorsFilter } from "./common/errors.filter.ts";
import type { Env } from "./env.ts";

/** Builds the HTTP application (used by main.ts and by the tests, which then call `inject`). */
export async function createApp(env: Env, { logger = true }: { logger?: boolean } = {}) {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.with(env),
    new FastifyAdapter({ trustProxy: env.TRUST_PROXY, bodyLimit: 256 * 1024 }),
    { logger: logger ? appLogger(env) : false },
  );
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ErrorsFilter());
  app.enableShutdownHooks();
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

const LEVELS: LogLevel[] = ["fatal", "error", "warn", "log", "debug", "verbose"];

/** Readable lines while developing; one JSON object per line in production (the platform's log viewer). */
function appLogger(env: Env) {
  return new ConsoleLogger({
    json: env.NODE_ENV === "production",
    colors: env.NODE_ENV !== "production",
    logLevels: LEVELS.slice(0, LEVELS.indexOf(env.LOG_LEVEL) + 1),
  });
}

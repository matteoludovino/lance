import { createApp } from "../src/bootstrap.ts";
import { loadEnv } from "../src/env.ts";
import type { Clock } from "../src/time/clock.ts";

export const ORIGIN = "http://localhost:3030";

export function testEnv(overrides: Record<string, string> = {}) {
  return loadEnv({
    DATABASE_URL: process.env["DATABASE_URL"]!,
    WEB_ORIGINS: ORIGIN,
    SCHEDULER: "off",
    ...overrides,
  });
}

export function testApp(overrides: Record<string, string> = {}, { clock }: { clock?: Clock } = {}) {
  return createApp(testEnv(overrides), { logger: false, clock });
}

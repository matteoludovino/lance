import { Controller, Get } from "@nestjs/common";
import { API_VERSION, type HealthResponse } from "@lance/shared";

@Controller("health")
export class HealthController {
  // No database query: the landing page calls this to wake the instance up, and the platform's health
  // check must not fail because the database is momentarily slow.
  @Get()
  health(): HealthResponse {
    return { status: "ok", version: API_VERSION };
  }
}

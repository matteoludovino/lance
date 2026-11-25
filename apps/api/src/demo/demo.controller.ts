import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { demoInput, type DemoEmail, type Me } from "@lance/shared";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { CurrentUser, Public, Viewer, type AuthUser } from "../auth/auth-user.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { Demo } from "./demo.service.ts";

@Controller("demo")
export class DemoController {
  constructor(private readonly demo: Demo) {}

  /** Starts a demo as one of its personas, or switches persona inside the current one. */
  @Public()
  @Post()
  enter(
    @Viewer() viewer: AuthUser | null,
    @Body(new ZodPipe(demoInput)) body: z.infer<typeof demoInput>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Me> {
    // Someone signed in to a real account doesn't start a demo on top of it.
    return this.demo.enter(viewer?.sandboxId ? viewer : null, body.persona, request.ip, reply);
  }

  @Get("emails")
  emails(@CurrentUser() user: AuthUser): Promise<DemoEmail[]> {
    return this.demo.emails(user);
  }
}

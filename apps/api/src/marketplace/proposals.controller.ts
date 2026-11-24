import { Body, Controller, HttpCode, Param, Post, Put } from "@nestjs/common";
import { acceptInput, proposalInput, type ProposalView } from "@lance/shared";
import type { z } from "zod";
import { CurrentUser, type AuthUser } from "../auth/auth-user.ts";
import { uuidParam } from "../common/params.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { Proposals } from "./proposals.service.ts";

const proposalId = uuidParam("Proposta não encontrada.");

@Controller("proposals")
export class ProposalsController {
  constructor(private readonly proposals: Proposals) {}

  @Put(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", proposalId) id: string,
    @Body(new ZodPipe(proposalInput)) body: z.infer<typeof proposalInput>,
  ): Promise<ProposalView> {
    return this.proposals.update(user, id, body);
  }

  @Post(":id/withdraw")
  @HttpCode(200)
  withdraw(@CurrentUser() user: AuthUser, @Param("id", proposalId) id: string): Promise<ProposalView> {
    return this.proposals.withdraw(user, id);
  }

  @Post(":id/decline")
  @HttpCode(200)
  decline(@CurrentUser() user: AuthUser, @Param("id", proposalId) id: string): Promise<ProposalView> {
    return this.proposals.decline(user, id);
  }

  @Post(":id/accept")
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Param("id", proposalId) id: string,
    @Body(new ZodPipe(acceptInput)) body: z.infer<typeof acceptInput>,
  ): Promise<{ contractId: string }> {
    return this.proposals.accept(user, id, body.version);
  }
}

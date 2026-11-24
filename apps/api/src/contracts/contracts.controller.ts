import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from "@nestjs/common";
import {
  deliveryInput,
  disputeInput,
  idempotencyKey,
  resolveInput,
  revisionInput,
  type ContractSummary,
  type ContractView,
  type DisputeView,
  type MilestoneActionResult,
  type WalletView,
} from "@lance/shared";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { adminOnly } from "../auth/admin.ts";
import { CurrentUser, type AuthUser } from "../auth/auth-user.ts";
import { uuidParam } from "../common/params.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { reconcile, type Problem } from "../ledger/reconciliation.ts";
import { Contracts } from "./contracts.service.ts";
import type { IdempotencyRequest } from "./idempotency.ts";
import { Milestones } from "./milestones.service.ts";

const milestoneId = uuidParam("Etapa não encontrada.");
const contractId = uuidParam("Contrato não encontrado.");
const retryKey = new ZodPipe(idempotencyKey.optional());

/** The retry key, bound to this request (method, path, body). */
function retry(
  user: AuthUser,
  header: string | undefined,
  request: FastifyRequest,
): IdempotencyRequest | undefined {
  const key = retryKey.transform(header);
  return key
    ? {
        userId: user.id,
        key,
        fingerprint: `${request.method} ${request.url} ${JSON.stringify(request.body ?? {})}`,
      }
    : undefined;
}

@Controller()
export class ContractsController {
  constructor(
    private readonly contracts: Contracts,
    private readonly milestones: Milestones,
    private readonly db: PrismaService,
  ) {}

  @Get("me/contracts")
  mine(@CurrentUser() user: AuthUser): Promise<ContractSummary[]> {
    return this.contracts.mine(user);
  }

  @Get("me/wallet")
  wallet(@CurrentUser() user: AuthUser): Promise<WalletView> {
    return this.contracts.wallet(user);
  }

  @Get("contracts/:id")
  view(@CurrentUser() user: AuthUser, @Param("id", contractId) id: string): Promise<ContractView> {
    return this.contracts.view(user, id);
  }

  @Post("milestones/:id/fund")
  @HttpCode(200)
  fund(
    @CurrentUser() user: AuthUser,
    @Param("id", milestoneId) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<MilestoneActionResult> {
    return this.milestones.fund(user, id, retry(user, key, request));
  }

  @Post("milestones/:id/submit")
  @HttpCode(200)
  submit(
    @CurrentUser() user: AuthUser,
    @Param("id", milestoneId) id: string,
    @Body(new ZodPipe(deliveryInput)) body: z.infer<typeof deliveryInput>,
  ): Promise<MilestoneActionResult> {
    return this.milestones.submit(user, id, body.note);
  }

  @Post("milestones/:id/approve")
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param("id", milestoneId) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<MilestoneActionResult> {
    return this.milestones.approve(user, id, retry(user, key, request));
  }

  @Post("milestones/:id/request-revision")
  @HttpCode(200)
  requestRevision(
    @CurrentUser() user: AuthUser,
    @Param("id", milestoneId) id: string,
    @Body(new ZodPipe(revisionInput)) body: z.infer<typeof revisionInput>,
  ): Promise<MilestoneActionResult> {
    return this.milestones.requestRevision(user, id, body.note);
  }

  @Post("milestones/:id/dispute")
  @HttpCode(200)
  dispute(
    @CurrentUser() user: AuthUser,
    @Param("id", milestoneId) id: string,
    @Body(new ZodPipe(disputeInput)) body: z.infer<typeof disputeInput>,
  ): Promise<MilestoneActionResult> {
    return this.milestones.dispute(user, id, body.reason);
  }

  @Post("milestones/:id/cancel")
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param("id", milestoneId) id: string,
  ): Promise<MilestoneActionResult> {
    return this.milestones.cancel(user, id);
  }

  @Post("admin/milestones/:id/resolve")
  @HttpCode(200)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param("id", milestoneId) id: string,
    @Body(new ZodPipe(resolveInput)) body: z.infer<typeof resolveInput>,
  ): Promise<MilestoneActionResult> {
    adminOnly(user);
    return this.milestones.resolve(user, id, body.outcome);
  }

  @Get("admin/disputes")
  disputes(@CurrentUser() user: AuthUser): Promise<DisputeView[]> {
    adminOnly(user);
    return this.contracts.disputes(user);
  }

  /** The ledger checked against itself and the milestones: an empty list means everything adds up. */
  @Get("admin/reconciliation")
  async reconciliation(@CurrentUser() user: AuthUser): Promise<{ ok: boolean; problems: Problem[] }> {
    adminOnly(user);
    const problems = await reconcile(this.db);
    return { ok: problems.length === 0, problems };
  }
}

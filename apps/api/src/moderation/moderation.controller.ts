import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  reportInput,
  reportListFilters,
  resolveReportInput,
  type AuditEntryView,
  type ReportDetail,
  type ReportView,
} from "@lance/shared";
import type { z } from "zod";
import { adminOnly } from "../auth/admin.ts";
import { CurrentUser, type AuthUser } from "../auth/auth-user.ts";
import { uuidParam } from "../common/params.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { Audit } from "./audit.ts";
import { Reports } from "./reports.service.ts";

const reportId = uuidParam("Denúncia não encontrada.");

@Controller()
export class ModerationController {
  constructor(
    private readonly reports: Reports,
    private readonly audit: Audit,
  ) {}

  @Post("reports")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(reportInput)) body: z.infer<typeof reportInput>,
  ): Promise<{ id: string }> {
    return this.reports.create(user, body);
  }

  @Get("admin/reports")
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodPipe(reportListFilters)) filters: z.infer<typeof reportListFilters>,
  ): Promise<ReportView[]> {
    adminOnly(user);
    return this.reports.list(user, filters.status);
  }

  @Get("admin/reports/:id")
  detail(@CurrentUser() user: AuthUser, @Param("id", reportId) id: string): Promise<ReportDetail> {
    adminOnly(user);
    return this.reports.detail(user, id);
  }

  @Post("admin/reports/:id/resolve")
  @HttpCode(200)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param("id", reportId) id: string,
    @Body(new ZodPipe(resolveReportInput)) body: z.infer<typeof resolveReportInput>,
  ): Promise<ReportView> {
    adminOnly(user);
    return this.reports.resolve(user, id, body.action, body.note);
  }

  @Post("admin/reports/:id/reopen")
  @HttpCode(200)
  reopen(@CurrentUser() user: AuthUser, @Param("id", reportId) id: string): Promise<ReportView> {
    adminOnly(user);
    return this.reports.reopen(user, id);
  }

  @Get("admin/audit")
  recent(@CurrentUser() user: AuthUser): Promise<AuditEntryView[]> {
    adminOnly(user);
    return this.audit.recent(user);
  }
}

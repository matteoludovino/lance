import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import {
  createProjectInput,
  projectFilters,
  projectInput,
  proposalInput,
  type MyProposal,
  type ProjectDetail,
  type ProjectSummary,
  type ProjectResults,
  type ProposalView,
} from "@lance/shared";
import type { z } from "zod";
import { CurrentUser, Public, Viewer, type AuthUser } from "../auth/auth-user.ts";
import { uuidParam } from "../common/params.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { Projects } from "./projects.service.ts";
import { Proposals } from "./proposals.service.ts";

const projectId = uuidParam("Projeto não encontrado.");

@Controller()
export class ProjectsController {
  constructor(
    private readonly projects: Projects,
    private readonly proposals: Proposals,
  ) {}

  @Public()
  @Get("projects")
  list(
    @Viewer() viewer: AuthUser | null,
    @Query(new ZodPipe(projectFilters)) filters: z.infer<typeof projectFilters>,
  ): Promise<ProjectResults> {
    return this.projects.list(viewer, filters);
  }

  @Post("projects")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createProjectInput)) body: z.infer<typeof createProjectInput>,
  ): Promise<ProjectDetail> {
    return this.projects.create(user, body);
  }

  @Get("me/projects")
  mine(@CurrentUser() user: AuthUser): Promise<ProjectSummary[]> {
    return this.projects.mine(user);
  }

  @Public()
  @Get("projects/:id")
  detail(@Viewer() viewer: AuthUser | null, @Param("id", projectId) id: string): Promise<ProjectDetail> {
    return this.projects.detail(viewer, id);
  }

  @Put("projects/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", projectId) id: string,
    @Body(new ZodPipe(projectInput)) body: z.infer<typeof projectInput>,
  ): Promise<ProjectDetail> {
    return this.projects.update(user, id, body);
  }

  @Post("projects/:id/publish")
  @HttpCode(200)
  publish(@CurrentUser() user: AuthUser, @Param("id", projectId) id: string): Promise<ProjectDetail> {
    return this.projects.publish(user, id);
  }

  @Post("projects/:id/close")
  @HttpCode(200)
  close(@CurrentUser() user: AuthUser, @Param("id", projectId) id: string): Promise<ProjectDetail> {
    return this.projects.close(user, id);
  }

  @Get("projects/:id/proposals")
  proposalsFor(@CurrentUser() user: AuthUser, @Param("id", projectId) id: string): Promise<ProposalView[]> {
    return this.proposals.forProject(user, id);
  }

  @Post("projects/:id/proposals")
  submit(
    @CurrentUser() user: AuthUser,
    @Param("id", projectId) id: string,
    @Body(new ZodPipe(proposalInput)) body: z.infer<typeof proposalInput>,
  ): Promise<ProposalView> {
    return this.proposals.submit(user, id, body);
  }

  @Get("me/proposals")
  myProposals(@CurrentUser() user: AuthUser): Promise<MyProposal[]> {
    return this.proposals.mine(user);
  }
}

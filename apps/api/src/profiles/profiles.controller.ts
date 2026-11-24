import { Body, Controller, Get, Param, Patch, Put } from "@nestjs/common";
import {
  clientProfileInput,
  freelancerProfileInput,
  updateAccountInput,
  type Me,
  type PublicClient,
  type PublicFreelancer,
} from "@lance/shared";
import type { z } from "zod";
import { CurrentUser, Public, Viewer, type AuthUser } from "../auth/auth-user.ts";
import { uuidParam } from "../common/params.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { Profiles } from "./profiles.service.ts";

const idParam = uuidParam("Perfil não encontrado.");

@Controller()
export class ProfilesController {
  constructor(private readonly profiles: Profiles) {}

  /** Who is signed in, if anyone: what the web app asks on every page (no 401 for visitors). */
  @Public()
  @Get("session")
  async session(@Viewer() viewer: AuthUser | null): Promise<{ me: Me | null }> {
    return { me: viewer ? await this.profiles.me(viewer.id) : null };
  }

  @Get("me")
  me(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.profiles.me(user.id);
  }

  @Patch("me")
  rename(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(updateAccountInput)) body: z.infer<typeof updateAccountInput>,
  ): Promise<Me> {
    return this.profiles.rename(user, body.name);
  }

  @Put("me/client-profile")
  putClient(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(clientProfileInput)) body: z.infer<typeof clientProfileInput>,
  ): Promise<Me> {
    return this.profiles.putClient(user, body);
  }

  @Put("me/freelancer-profile")
  putFreelancer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(freelancerProfileInput)) body: z.infer<typeof freelancerProfileInput>,
  ): Promise<Me> {
    return this.profiles.putFreelancer(user, body);
  }

  @Public()
  @Get("freelancers/:id")
  freelancer(@Viewer() viewer: AuthUser | null, @Param("id", idParam) id: string): Promise<PublicFreelancer> {
    return this.profiles.publicFreelancer(viewer, id);
  }

  @Public()
  @Get("clients/:id")
  client(@Viewer() viewer: AuthUser | null, @Param("id", idParam) id: string): Promise<PublicClient> {
    return this.profiles.publicClient(viewer, id);
  }
}

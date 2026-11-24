import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { reviewInput, type ContractReviews, type Page, type ReviewView } from "@lance/shared";
import { z } from "zod";
import { CurrentUser, Public, Viewer, type AuthUser } from "../auth/auth-user.ts";
import { uuidParam } from "../common/params.ts";
import { ZodPipe } from "../common/zod.pipe.ts";
import { Reviews } from "./reviews.service.ts";

const contractId = uuidParam("Contrato não encontrado.");
const personId = uuidParam("Perfil não encontrado.");
const paging = z.object({ cursor: z.uuid().optional() });

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: Reviews) {}

  @Get("contracts/:id/reviews")
  forContract(@CurrentUser() user: AuthUser, @Param("id", contractId) id: string): Promise<ContractReviews> {
    return this.reviews.forContract(user, id);
  }

  @Post("contracts/:id/reviews")
  write(
    @CurrentUser() user: AuthUser,
    @Param("id", contractId) id: string,
    @Body(new ZodPipe(reviewInput)) body: z.infer<typeof reviewInput>,
  ): Promise<ReviewView> {
    return this.reviews.write(user, id, body);
  }

  @Public()
  @Get("freelancers/:id/reviews")
  aboutFreelancer(
    @Viewer() viewer: AuthUser | null,
    @Param("id", personId) id: string,
    @Query(new ZodPipe(paging)) page: z.infer<typeof paging>,
  ): Promise<Page<ReviewView>> {
    return this.reviews.about(viewer, id, "freelancer", page.cursor);
  }

  @Public()
  @Get("clients/:id/reviews")
  aboutClient(
    @Viewer() viewer: AuthUser | null,
    @Param("id", personId) id: string,
    @Query(new ZodPipe(paging)) page: z.infer<typeof paging>,
  ): Promise<Page<ReviewView>> {
    return this.reviews.about(viewer, id, "client", page.cursor);
  }
}

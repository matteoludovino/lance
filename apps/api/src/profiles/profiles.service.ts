import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ClientProfile as ClientProfileView,
  ClientProfileInput,
  FreelancerProfile as FreelancerProfileView,
  FreelancerProfileInput,
  Me,
  PublicClient,
  PublicFreelancer,
} from "@lance/shared";
import type { ClientProfile, FreelancerProfile } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { reputations } from "../reviews/reputation.ts";
import { visibleTo } from "../sandbox/scope.ts";
import { Clock } from "../time/clock.ts";
import type { AuthUser } from "../auth/auth-user.ts";

type Parsed<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

/** The two sides of an account, and the public pages built from them. */
@Injectable()
export class Profiles {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  async me(userId: string): Promise<Me> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { clientProfile: true, freelancerProfile: true },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      demo: user.sandboxId !== null,
      client: user.clientProfile && clientView(user.clientProfile),
      freelancer: user.freelancerProfile && freelancerView(user.freelancerProfile),
    };
  }

  async rename(user: AuthUser, name: string): Promise<Me> {
    await this.db.user.update({ where: { id: user.id }, data: { name } });
    return this.me(user.id);
  }

  /** Creates or replaces the client side of the caller's account. */
  async putClient(user: AuthUser, input: Parsed<ClientProfileInput>): Promise<Me> {
    await this.db.clientProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, sandboxId: user.sandboxId, ...input },
      update: input,
    });
    return this.me(user.id);
  }

  async putFreelancer(user: AuthUser, input: Parsed<FreelancerProfileInput>): Promise<Me> {
    const data = { ...input, minBudgetCents: BigInt(input.minBudgetCents) };
    await this.db.freelancerProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, sandboxId: user.sandboxId, ...data },
      update: data,
    });
    return this.me(user.id);
  }

  async publicFreelancer(viewer: AuthUser | null, id: string): Promise<PublicFreelancer> {
    const profile = await this.db.freelancerProfile.findFirst({
      where: { userId: id, ...this.visible(viewer, id) },
      include: { user: true },
    });
    if (!profile) throw notFound();
    const reputation = await reputations(this.db, [id], "freelancer", this.clock.now());
    return {
      id: profile.userId,
      name: profile.user.name,
      memberSince: profile.user.createdAt.toISOString(),
      ...freelancerView(profile),
      reputation: reputation.get(id)!,
    };
  }

  async publicClient(viewer: AuthUser | null, id: string): Promise<PublicClient> {
    const profile = await this.db.clientProfile.findFirst({
      where: { userId: id, ...this.visible(viewer, id) },
      include: { user: true },
    });
    if (!profile) throw notFound();
    const reputation = await reputations(this.db, [id], "client", this.clock.now());
    return {
      id: profile.userId,
      name: profile.user.name,
      memberSince: profile.user.createdAt.toISOString(),
      ...clientView(profile),
      reputation: reputation.get(id)!,
    };
  }

  /** Others see a profile if it's in their view of the marketplace and moderation left it up; owners always. */
  private visible(viewer: AuthUser | null, ownerId: string) {
    if (viewer?.id === ownerId) return {};
    return { ...visibleTo(viewer), hiddenAt: null, user: { suspendedAt: null } };
  }
}

function notFound() {
  return new NotFoundException({ code: "not_found", message: "Perfil não encontrado." });
}

function clientView(profile: ClientProfile): ClientProfileView {
  return { company: profile.company, about: profile.about, city: profile.city, state: profile.state };
}

function freelancerView(profile: FreelancerProfile): FreelancerProfileView {
  return {
    headline: profile.headline,
    bio: profile.bio,
    category: profile.category,
    skills: profile.skills,
    minBudgetCents: Number(profile.minBudgetCents),
    available: profile.available,
    city: profile.city,
    state: profile.state,
  };
}

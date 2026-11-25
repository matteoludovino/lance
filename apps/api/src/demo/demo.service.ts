import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createProjectInput, proposalInput, type DemoEmail, type Me } from "@lance/shared";
import type { FastifyReply } from "fastify";
import type { AuthUser } from "../auth/auth-user.ts";
import { Sessions } from "../auth/sessions.service.ts";
import { uuidv7 } from "../common/ids.ts";
import { RateLimiter } from "../common/rate-limiter.ts";
import { Milestones } from "../contracts/milestones.service.ts";
import { ENV, type Env } from "../env.ts";
import { Projects } from "../marketplace/projects.service.ts";
import { Proposals } from "../marketplace/proposals.service.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Profiles } from "../profiles/profiles.service.ts";
import { Sandboxes } from "../sandbox/sandboxes.service.ts";
import { Clock } from "../time/clock.ts";
import {
  OPEN_PROJECT,
  PERSONAS,
  STARTER_DELIVERY,
  STARTER_PROJECT,
  STARTER_PROPOSAL,
  type Persona,
} from "./content.ts";

/** New demos per client address. */
const DEMOS_PER_IP = { max: 5, windowMs: 3_600_000 };

/**
 * One-click demos. A visitor gets a sandbox of their own with three people in it (a client, a
 * freelancer and an admin who moderates only that sandbox), a contract already under way and an open
 * project that seeded freelancers answer. They are signed in as the persona they picked, and can switch
 * to the others without starting over. Everything goes after a day.
 */
@Injectable()
export class Demo {
  private readonly logger = new Logger("Demo");

  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    private readonly sandboxes: Sandboxes,
    private readonly sessions: Sessions,
    private readonly profiles: Profiles,
    private readonly projects: Projects,
    private readonly proposals: Proposals,
    private readonly milestones: Milestones,
    private readonly outbox: OutboxService,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Signs in as `persona`: in the viewer's own demo if they're already in one (switching), otherwise
   * in a new one, within the per-address and global limits.
   */
  async enter(viewer: AuthUser | null, persona: Persona, ip: string, reply: FastifyReply): Promise<Me> {
    let sandboxId = viewer?.sandboxId ?? null;
    if (!sandboxId) {
      this.limiter.check(`demo:ip:${ip}`, DEMOS_PER_IP);
      if ((await this.sandboxes.active()) >= this.env.DEMO_MAX_SANDBOXES) {
        throw new ServiceUnavailableException({
          code: "demo_full",
          message: "A demonstração está cheia agora. Tente de novo em alguns minutos.",
          retryAfter: 300,
        });
      }
      this.limiter.hit(`demo:ip:${ip}`, DEMOS_PER_IP);
      sandboxId = await this.build();
    }
    const person = await this.db.user.findFirstOrThrow({
      where: { sandboxId, email: emailOf(persona, sandboxId) },
      select: { id: true },
    });
    if (viewer) {
      // Switching: this browser's previous session ends. Its live connection is left to the page, which
      // reconnects as the new person: closing it from here ("signed out") would race the new cookie and
      // send the page to the sign-in screen.
      await this.db.session.deleteMany({ where: { id: viewer.sessionId } });
    }
    await this.sessions.start(reply, person.id);
    return this.profiles.me(person.id);
  }

  /** The emails the demo's people got (none leave the server): the demo's inbox. */
  async emails(viewer: AuthUser): Promise<DemoEmail[]> {
    if (!viewer.sandboxId) return [];
    const emails = await this.db.sentEmail.findMany({
      where: { sandboxId: viewer.sandboxId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    const people = await this.db.user.findMany({
      where: { id: { in: [...new Set(emails.flatMap((email) => (email.userId ? [email.userId] : [])))] } },
      select: { id: true, name: true },
    });
    const names = new Map(people.map((person) => [person.id, person.name]));
    return emails.map((email) => ({
      id: email.id,
      to: (email.userId && names.get(email.userId)) ?? email.to,
      subject: email.subject,
      text: email.text,
      createdAt: email.createdAt.toISOString(),
    }));
  }

  /** A new sandbox with its three people and its starting story. */
  private async build(): Promise<string> {
    const sandboxId = await this.sandboxes.create();
    const now = this.clock.now();
    const make = async (persona: Persona) => {
      const id = uuidv7(now.getTime());
      await this.db.user.create({
        data: {
          id,
          email: emailOf(persona, sandboxId),
          name: PERSONAS[persona].name,
          role: persona === "admin" ? "admin" : "user",
          emailVerifiedAt: now,
          sandboxId,
          createdAt: now,
        },
      });
      return id;
    };
    const clientId = await make("client");
    const freelancerId = await make("freelancer");
    await make("admin");
    await this.db.clientProfile.create({ data: { userId: clientId, sandboxId, ...PERSONAS.client.client } });
    const { minBudgetCents, ...freelancer } = PERSONAS.freelancer.freelancer;
    await this.db.freelancerProfile.create({
      data: {
        userId: freelancerId,
        sandboxId,
        ...freelancer,
        skills: [...freelancer.skills],
        minBudgetCents: BigInt(minBudgetCents),
      },
    });

    // The story so far, told through the same services people use (same rules, same ledger).
    const client = actor(clientId, PERSONAS.client.name, sandboxId);
    const freelancerActor = actor(freelancerId, PERSONAS.freelancer.name, sandboxId);
    const starter = await this.projects.create(client, {
      ...createProjectInput.parse({ ...STARTER_PROJECT, publish: true }),
    });
    const proposal = await this.proposals.submit(
      freelancerActor,
      starter.id,
      proposalInput.parse(STARTER_PROPOSAL),
    );
    const { contractId } = await this.proposals.accept(client, proposal.id, proposal.version);
    const first = await this.db.contractMilestone.findFirstOrThrow({
      where: { contractId, position: 1 },
      select: { id: true },
    });
    await this.milestones.fund(client, first.id);
    await this.milestones.submit(freelancerActor, first.id, STARTER_DELIVERY);
    await this.projects.create(client, createProjectInput.parse({ ...OPEN_PROJECT, publish: true }));
    this.outbox.committed();
    this.logger.log(`demo sandbox ${sandboxId} ready`);
    return sandboxId;
  }
}

function emailOf(persona: Persona, sandboxId: string): string {
  return `${persona}.${sandboxId}@demo.lance.invalid`;
}

/** Someone acting in the demo's sandbox, without a browser session. */
export function actor(
  id: string,
  name: string,
  sandboxId: string,
  role: "user" | "admin" = "user",
): AuthUser {
  return { id, name, email: "", role, sandboxId, sessionId: "" };
}

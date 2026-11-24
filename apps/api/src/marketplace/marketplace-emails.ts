import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { formatBRL } from "@lance/shared";
import { ENV, type Env } from "../env.ts";
import { Mailer } from "../mail/mailer.service.ts";
import { proposalAccepted, proposalDeclined, proposalReceived } from "../mail/templates.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";

export const MARKET_EVENTS = {
  proposalSubmitted: "proposal.submitted",
  proposalAccepted: "proposal.accepted",
  proposalDeclined: "proposal.declined",
} as const;

/** Tells each side what happened to a proposal. (Preferences and digests arrive in stage 8.) */
@Injectable()
export class MarketplaceEmails implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.outbox.handle(MARKET_EVENTS.proposalSubmitted, async ({ payload }) => {
      const proposal = await this.proposal(payload);
      if (!proposal || proposal.status !== "submitted") return;
      const client = proposal.project.client;
      await this.mailer.send(
        { userId: client.id, email: client.email, sandboxId: client.sandboxId },
        "proposal_received",
        proposalReceived(
          client.name,
          proposal.project.title,
          proposal.freelancer.name,
          formatBRL(Number(proposal.priceCents)),
          this.url(`/projetos/${proposal.projectId}`),
        ),
      );
    });
    this.outbox.handle(MARKET_EVENTS.proposalAccepted, async ({ payload }) => {
      const proposal = await this.proposal(payload);
      if (!proposal) return;
      const { freelancer } = proposal;
      await this.mailer.send(
        { userId: freelancer.id, email: freelancer.email, sandboxId: freelancer.sandboxId },
        "proposal_accepted",
        proposalAccepted(
          freelancer.name,
          proposal.project.title,
          proposal.project.client.name,
          this.url(`/projetos/${proposal.projectId}`),
        ),
      );
    });
    this.outbox.handle(MARKET_EVENTS.proposalDeclined, async ({ payload }) => {
      const proposal = await this.proposal(payload);
      if (!proposal || proposal.status !== "declined") return;
      const { freelancer } = proposal;
      await this.mailer.send(
        { userId: freelancer.id, email: freelancer.email, sandboxId: freelancer.sandboxId },
        "proposal_declined",
        proposalDeclined(freelancer.name, proposal.project.title, this.url("/projetos")),
      );
    });
  }

  private url(path: string): string {
    return new URL(path, this.env.WEB_URL).href;
  }

  private proposal(payload: unknown) {
    const { proposalId } = payload as { proposalId: string };
    return this.db.proposal.findUnique({
      where: { id: proposalId },
      include: { freelancer: true, project: { include: { client: true } } },
    });
  }
}

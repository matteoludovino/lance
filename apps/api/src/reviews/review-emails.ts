import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { ENV, type Env } from "../env.ts";
import { Mailer } from "../mail/mailer.service.ts";
import { reviewUpdate } from "../mail/templates.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { REVIEW_EVENTS } from "./reviews.service.ts";

/**
 * Review emails. A reveal is announced once: when the second review arrives, or (if only one was
 * written) when the window closes; the window event does nothing if both were already in.
 */
@Injectable()
export class ReviewEmails implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.outbox.handle(REVIEW_EVENTS.requested, async ({ payload }) => {
      const contract = await this.contract(payload);
      if (!contract) return;
      for (const [person, other] of [
        [contract.client, contract.freelancer],
        [contract.freelancer, contract.client],
      ] as const) {
        await this.send(
          person,
          "review_requested",
          `Como foi trabalhar com ${other.name}?`,
          `O contrato “${contract.project.title}” terminou. Você tem 14 dias para avaliar ${other.name}; a avaliação de cada lado só aparece quando os dois avaliarem ou o prazo acabar.`,
          contract.id,
          "Avaliar",
        );
      }
    });
    this.outbox.handle(REVIEW_EVENTS.revealed, async ({ payload }) => {
      const contract = await this.contract(payload);
      if (!contract) return;
      for (const person of [contract.client, contract.freelancer]) {
        await this.send(
          person,
          "reviews_revealed",
          `As avaliações de “${contract.project.title}” estão visíveis`,
          "Os dois lados avaliaram: agora cada um vê o que o outro escreveu.",
          contract.id,
          "Ver avaliações",
        );
      }
    });
    this.outbox.handle(REVIEW_EVENTS.windowClosed, async ({ payload }) => {
      const contract = await this.contract(payload);
      if (!contract) return;
      const reviews = await this.db.review.findMany({ where: { contractId: contract.id } });
      // Both in: already announced when the second arrived. None: nothing to reveal.
      if (reviews.length !== 1) return;
      const reviewee = reviews[0]!.revieweeId === contract.clientId ? contract.client : contract.freelancer;
      await this.send(
        reviewee,
        "review_revealed",
        "Você recebeu uma avaliação",
        `O prazo de avaliação de “${contract.project.title}” terminou, e a avaliação que você recebeu agora está visível.`,
        contract.id,
        "Ver avaliação",
      );
    });
  }

  private contract(payload: unknown) {
    const { contractId } = payload as { contractId: string };
    return this.db.contract.findUnique({
      where: { id: contractId },
      include: { client: true, freelancer: true, project: { select: { title: true } } },
    });
  }

  private send(
    person: { id: string; email: string; name: string; sandboxId: string | null },
    kind: string,
    subject: string,
    sentence: string,
    contractId: string,
    label: string,
  ) {
    return this.mailer.send(
      { userId: person.id, email: person.email, sandboxId: person.sandboxId },
      kind,
      reviewUpdate(
        person.name,
        subject,
        sentence,
        new URL(`/contratos/${contractId}`, this.env.WEB_URL).href,
        label,
      ),
    );
  }
}

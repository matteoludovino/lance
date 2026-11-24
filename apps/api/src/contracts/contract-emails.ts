import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { formatBRL } from "@lance/shared";
import { ENV, type Env } from "../env.ts";
import { Mailer } from "../mail/mailer.service.ts";
import { milestoneUpdate } from "../mail/templates.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { MILESTONE_CHANGED, type Change } from "./milestones.service.ts";

interface Copy {
  to: ("client" | "freelancer")[];
  subject: (m: string) => string;
  sentence: (m: string, amount: string) => string;
}

const COPY: Record<Change, Copy> = {
  funded: {
    to: ["freelancer"],
    subject: (m) => `Etapa “${m}” depositada: pode começar`,
    sentence: (m, amount) =>
      `O cliente depositou ${amount} para a etapa “${m}”. O valor fica guardado até a aprovação.`,
  },
  submitted: {
    to: ["client"],
    subject: (m) => `Entrega da etapa “${m}”`,
    sentence: (m) =>
      `A etapa “${m}” foi entregue. Aprove, peça uma revisão ou abra uma disputa antes do prazo.`,
  },
  approved: {
    to: ["freelancer"],
    subject: (m) => `Etapa “${m}” aprovada`,
    sentence: (m, amount) =>
      `O cliente aprovou a etapa “${m}”: ${amount} foram liberados para a sua carteira (menos a taxa).`,
  },
  auto_released: {
    to: ["client", "freelancer"],
    subject: (m) => `Etapa “${m}” paga automaticamente`,
    sentence: (m) =>
      `O prazo de aprovação da etapa “${m}” terminou sem resposta, e o pagamento foi liberado.`,
  },
  revision_requested: {
    to: ["freelancer"],
    subject: (m) => `Revisão pedida na etapa “${m}”`,
    sentence: (m) => `O cliente pediu uma revisão na etapa “${m}”. Veja o pedido no contrato.`,
  },
  disputed: {
    to: ["client", "freelancer"],
    subject: (m) => `Disputa aberta na etapa “${m}”`,
    sentence: (m) => `Uma disputa foi aberta na etapa “${m}”. A equipe do Lance vai analisar e decidir.`,
  },
  cancelled: {
    to: ["client", "freelancer"],
    subject: (m) => `Etapa “${m}” cancelada`,
    sentence: (m) => `A etapa “${m}” foi cancelada antes do depósito.`,
  },
  refunded: {
    to: ["client", "freelancer"],
    subject: (m) => `Etapa “${m}” cancelada e reembolsada`,
    sentence: (m, amount) =>
      `A etapa “${m}” foi cancelada antes da entrega: ${amount} voltaram para o cliente.`,
  },
  resolved_released: {
    to: ["client", "freelancer"],
    subject: (m) => `Disputa da etapa “${m}” decidida`,
    sentence: (m, amount) =>
      `A disputa da etapa “${m}” foi decidida a favor do freelancer: ${amount} foram liberados.`,
  },
  resolved_refunded: {
    to: ["client", "freelancer"],
    subject: (m) => `Disputa da etapa “${m}” decidida`,
    sentence: (m, amount) =>
      `A disputa da etapa “${m}” foi decidida a favor do cliente: ${amount} foram reembolsados.`,
  },
};

/** Tells the party (or parties) concerned what happened to a milestone. */
@Injectable()
export class ContractEmails implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.outbox.handle(MILESTONE_CHANGED, async ({ payload }) => {
      const { milestoneId, change } = payload as { milestoneId: string; change: Change };
      const m = await this.db.contractMilestone.findUnique({
        where: { id: milestoneId },
        include: { contract: { include: { client: true, freelancer: true } } },
      });
      const copy = COPY[change];
      if (!m || !copy) return;
      const url = new URL(`/contratos/${m.contractId}`, this.env.WEB_URL).href;
      const amount = formatBRL(Number(m.amountCents));
      for (const side of copy.to) {
        const person = side === "client" ? m.contract.client : m.contract.freelancer;
        await this.mailer.send(
          { userId: person.id, email: person.email, sandboxId: person.sandboxId },
          `milestone_${change}`,
          milestoneUpdate(person.name, copy.subject(m.title), copy.sentence(m.title, amount), url),
        );
      }
    });
  }
}

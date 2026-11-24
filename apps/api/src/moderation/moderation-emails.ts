import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import { REPORT_REASON_LABELS } from "@lance/shared";
import { ENV, type Env } from "../env.ts";
import { Mailer } from "../mail/mailer.service.ts";
import { moderationNotice } from "../mail/templates.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { MODERATION_NOTICE, type ModerationNotice } from "./reports.service.ts";

const WHAT: Record<ModerationNotice["targetType"], string> = {
  project: "Seu projeto",
  profile: "Seu perfil",
  message: "Uma mensagem sua",
  review: "Uma avaliação sua",
};

/** Tells people what moderation decided about their content or account, and why. */
@Injectable()
export class ModerationEmails implements OnModuleInit {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    this.outbox.handle(MODERATION_NOTICE, async (event) => {
      const notice = event.payload as ModerationNotice;
      const person = await this.db.user.findUnique({ where: { id: notice.userId } });
      if (!person) return;
      const why = REPORT_REASON_LABELS[notice.reason].toLowerCase();
      const email =
        notice.resolution === "suspended"
          ? moderationNotice(person.name, "Sua conta no Lance foi suspensa", [
              `Depois de uma denúncia por ${why}, a moderação suspendeu a sua conta: você não consegue entrar, e seus projetos e perfis não aparecem para ninguém.`,
              "Se acha que foi um engano, responda a este e-mail contando o que aconteceu.",
            ])
          : moderationNotice(person.name, "Um conteúdo seu foi ocultado no Lance", [
              `${WHAT[notice.targetType]} (“${notice.label}”) foi ocultado pela moderação depois de uma denúncia por ${why}.`,
              `Sua conta continua ativa. Releia as regras do Lance em ${new URL("/", this.env.WEB_URL).href} para evitar novas denúncias.`,
            ]);
      await this.mailer.send(
        { userId: person.id, email: person.email, sandboxId: person.sandboxId },
        `moderation_${notice.resolution}`,
        email,
      );
    });
  }
}

import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { uuidv7 } from "../common/ids.ts";
import { ENV, type Env } from "../env.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Clock } from "../time/clock.ts";
import type { Email } from "./templates.ts";

export interface Recipient {
  userId: string;
  email: string;
  sandboxId: string | null;
}

/**
 * Sends email over SMTP (Mailpit locally). Demo accounts never get real email: theirs are kept for the
 * visitor to read in the app. Without an SMTP server, everything is kept, and so is email to the seeded
 * people's undeliverable addresses. Called from outbox handlers,
 * so a failure here is retried later.
 */
@Injectable()
export class Mailer implements OnModuleDestroy {
  private readonly logger = new Logger("Mailer");
  private readonly transport: Transporter | null;

  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.transport = env.SMTP_URL ? createTransport(env.SMTP_URL) : null;
  }

  async send(to: Recipient, kind: string, email: Email): Promise<void> {
    // Seeded people have reserved .invalid addresses (RFC 2606): nothing to deliver to.
    if (this.transport && !to.sandboxId && !to.email.endsWith(".invalid")) {
      await this.transport.sendMail({
        from: this.env.MAIL_FROM,
        to: to.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      this.logger.log(`sent ${kind} to user ${to.userId}`);
      return;
    }
    const now = this.clock.now();
    await this.db.sentEmail.create({
      data: {
        id: uuidv7(now.getTime()),
        sandboxId: to.sandboxId,
        userId: to.userId,
        to: to.email,
        kind,
        subject: email.subject,
        text: email.text,
        html: email.html,
        createdAt: now,
      },
    });
  }

  onModuleDestroy(): void {
    this.transport?.close();
  }
}

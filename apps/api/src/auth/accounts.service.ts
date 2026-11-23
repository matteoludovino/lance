import { ForbiddenException, Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import type { LoginInput, Me, ResetInput, SignupInput } from "@lance/shared";
import type { FastifyReply } from "fastify";
import { uuidv7 } from "../common/ids.ts";
import { RateLimiter } from "../common/rate-limiter.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Profiles } from "../profiles/profiles.service.ts";
import { Clock } from "../time/clock.ts";
import { ACCOUNT_EVENTS } from "./account-emails.ts";
import { EmailTokens } from "./email-tokens.ts";
import { Passwords } from "./passwords.ts";
import { Sessions } from "./sessions.service.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const LIMITS = {
  signupPerIp: { max: 5, windowMs: HOUR },
  loginPerIp: { max: 30, windowMs: 10 * MINUTE },
  /** Wrong passwords for one address, from anywhere. */
  loginFailuresPerEmail: { max: 5, windowMs: 15 * MINUTE },
  emailPerIp: { max: 10, windowMs: HOUR },
  emailPerAddress: { max: 3, windowMs: HOUR },
  tokenPerIp: { max: 20, windowMs: 10 * MINUTE },
};

type Parsed<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

/**
 * Sign up, verify, sign in, reset. Answers never reveal whether an address has an account: sign-up,
 * resend and "forgot password" always answer the same, and the email tells the owner what happened.
 */
@Injectable()
export class Accounts {
  constructor(
    private readonly db: PrismaService,
    private readonly passwords: Passwords,
    private readonly sessions: Sessions,
    private readonly tokens: EmailTokens,
    private readonly outbox: OutboxService,
    private readonly profiles: Profiles,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async signup(input: Parsed<SignupInput>, ip: string): Promise<void> {
    this.limiter.hit(`signup:ip:${ip}`, LIMITS.signupPerIp);
    // Hashed even when the address is taken, so both answers take as long.
    const passwordHash = await this.passwords.hash(input.password);
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    try {
      await this.db.$transaction(async (tx) => {
        if (existing) {
          await this.outbox.add(tx, ACCOUNT_EVENTS.signupWithExistingEmail, { userId: existing.id });
          return;
        }
        const now = this.clock.now();
        const id = uuidv7(now.getTime());
        await tx.user.create({
          data: { id, email: input.email, name: input.name, passwordHash, createdAt: now },
        });
        await this.outbox.add(tx, ACCOUNT_EVENTS.verifyRequested, { userId: id });
      });
    } catch (error) {
      // Two sign-ups for one address at the same moment: the other one won, which is the same answer.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
    this.outbox.committed();
  }

  async login(input: Parsed<LoginInput>, ip: string, reply: FastifyReply): Promise<Me> {
    this.limiter.hit(`login:ip:${ip}`, LIMITS.loginPerIp);
    const failuresKey = `login:email:${input.email}`;
    this.limiter.check(failuresKey, LIMITS.loginFailuresPerEmail);
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    if (!(await this.passwords.verify(user?.passwordHash ?? null, input.password)) || !user) {
      this.limiter.hit(failuresKey, LIMITS.loginFailuresPerEmail);
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "E-mail ou senha incorretos.",
      });
    }
    this.limiter.reset(failuresKey);
    // Only someone who knows the password learns these.
    if (user.suspendedAt) throw suspended();
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: "unverified",
        message: "Confirme seu e-mail antes de entrar: o link está na sua caixa de entrada.",
      });
    }
    await this.sessions.start(reply, user.id);
    return this.profiles.me(user.id);
  }

  /** The link in the verification email: confirms the address and signs the person in. */
  async verify(token: string, ip: string, reply: FastifyReply): Promise<Me> {
    this.limiter.hit(`token:ip:${ip}`, LIMITS.tokenPerIp);
    const userId = await this.db.$transaction(async (tx) => {
      const userId = await this.tokens.consume(tx, token, "verify_email");
      if (!userId) return null;
      const user = await tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: this.clock.now() },
      });
      if (user.suspendedAt) throw suspended();
      await this.sessions.start(reply, userId, tx);
      return userId;
    });
    if (!userId) throw invalidLink();
    return this.profiles.me(userId);
  }

  async resendVerification(email: string, ip: string): Promise<void> {
    this.limitEmail(email, ip);
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt || user.suspendedAt) return;
    await this.db.$transaction((tx) =>
      this.outbox.add(tx, ACCOUNT_EVENTS.verifyRequested, { userId: user.id }),
    );
    this.outbox.committed();
  }

  async forgotPassword(email: string, ip: string): Promise<void> {
    this.limitEmail(email, ip);
    const user = await this.db.user.findUnique({ where: { email } });
    // Seeded people and demo personas have no password to reset.
    if (!user || user.suspendedAt || !user.passwordHash) return;
    await this.db.$transaction((tx) =>
      this.outbox.add(tx, ACCOUNT_EVENTS.resetRequested, { userId: user.id }),
    );
    this.outbox.committed();
  }

  /** New password: every other session ends, and the address counts as verified (the link proved it). */
  async resetPassword(input: Parsed<ResetInput>, ip: string, reply: FastifyReply): Promise<Me> {
    this.limiter.hit(`token:ip:${ip}`, LIMITS.tokenPerIp);
    const passwordHash = await this.passwords.hash(input.password);
    const userId = await this.db.$transaction(async (tx) => {
      const userId = await this.tokens.consume(tx, input.token, "reset_password");
      if (!userId) return null;
      const now = this.clock.now();
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.suspendedAt) throw suspended();
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
      });
      await tx.session.deleteMany({ where: { userId } });
      await this.sessions.start(reply, userId, tx);
      return userId;
    });
    if (!userId) throw invalidLink();
    return this.profiles.me(userId);
  }

  private limitEmail(email: string, ip: string): void {
    this.limiter.hit(`email:ip:${ip}`, LIMITS.emailPerIp);
    this.limiter.hit(`email:address:${email}`, LIMITS.emailPerAddress);
  }
}

function suspended() {
  return new ForbiddenException({ code: "suspended", message: "Esta conta está suspensa." });
}

function invalidLink() {
  return new BadRequestException({
    code: "invalid_link",
    message: "Este link expirou ou já foi usado. Peça um novo.",
  });
}

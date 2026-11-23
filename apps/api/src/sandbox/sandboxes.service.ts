import { Injectable } from "@nestjs/common";
import { uuidv7 } from "../common/ids.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { Clock } from "../time/clock.ts";

const LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Demo sandboxes: a visitor's private copy-on-write corner of the marketplace, gone after a day. */
@Injectable()
export class Sandboxes {
  constructor(
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}

  async create(): Promise<string> {
    const now = this.clock.now();
    const { id } = await this.db.sandbox.create({
      data: { id: uuidv7(now.getTime()), createdAt: now, expiresAt: new Date(now.getTime() + LIFETIME_MS) },
    });
    return id;
  }
}

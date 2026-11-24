import { HttpException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.ts";
import type { Tx } from "../outbox/outbox.service.ts";

export interface IdempotencyRequest {
  userId: string;
  key: string;
  /** What the key promises: method, path and body. */
  fingerprint: string;
}

/** Returned instead of running the work again: the first answer to this key. */
export class Replayed<T> {
  constructor(readonly body: T) {}
}

/**
 * Retry keys for requests that move money. The key row is written first in the same transaction as the
 * work: a second request with the key waits for the first to commit, then finds its stored answer. The
 * same key for a different request is refused (422); a key whose first request failed is free again,
 * since that transaction (and its row) rolled back.
 */
@Injectable()
export class Idempotency {
  static hash(fingerprint: string): string {
    return createHash("sha256").update(fingerprint).digest("hex");
  }

  /** Claims the key, or returns the stored answer. */
  async claim<T>(tx: Tx, request: IdempotencyRequest): Promise<Replayed<T> | null> {
    const hash = Idempotency.hash(request.fingerprint);
    const inserted = await tx.$executeRaw`
      INSERT INTO idempotency_keys ("userId", key, "requestHash")
      VALUES (${request.userId}::uuid, ${request.key}, ${hash})
      ON CONFLICT ("userId", key) DO NOTHING`;
    if (inserted === 1) return null;
    const row = await tx.idempotencyKey.findUniqueOrThrow({
      where: { userId_key: { userId: request.userId, key: request.key } },
    });
    if (row.requestHash !== hash) {
      throw new UnprocessableEntityException({
        code: "idempotency_key_reused",
        message: "Esta chave de repetição já foi usada para outro pedido.",
      });
    }
    if (row.responseBody === null) {
      throw new HttpException(
        { code: "in_progress", message: "Este pedido ainda está sendo processado." },
        409,
      );
    }
    return new Replayed(row.responseBody as T);
  }

  async store(tx: Tx, request: IdempotencyRequest, body: Prisma.InputJsonValue): Promise<void> {
    await tx.idempotencyKey.update({
      where: { userId_key: { userId: request.userId, key: request.key } },
      data: { responseStatus: 200, responseBody: body },
    });
  }
}

import { Prisma } from "../generated/prisma/client.ts";

/**
 * The one rule of demo isolation, for every read of something people write: the seeded marketplace
 * (no sandbox) plus, for a demo visitor, their own sandbox. Never another visitor's.
 */
export function visibleTo(viewer: { sandboxId: string | null } | null) {
  const sandboxId = viewer?.sandboxId ?? null;
  return sandboxId === null ? { sandboxId: null } : { OR: [{ sandboxId: null }, { sandboxId }] };
}

/** The same rule for hand-written SQL: `column` is the row's sandbox column (e.g. `p."sandboxId"`). */
export function visibleToSql(viewer: { sandboxId: string | null } | null, column: string): Prisma.Sql {
  const sandboxId = viewer?.sandboxId ?? null;
  const col = Prisma.raw(column);
  return sandboxId === null
    ? Prisma.sql`${col} IS NULL`
    : Prisma.sql`(${col} IS NULL OR ${col} = ${sandboxId}::uuid)`;
}

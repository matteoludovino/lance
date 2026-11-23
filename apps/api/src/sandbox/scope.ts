/**
 * The one rule of demo isolation, for every read of something people write: the seeded marketplace
 * (no sandbox) plus, for a demo visitor, their own sandbox. Never another visitor's.
 */
export function visibleTo(viewer: { sandboxId: string | null } | null) {
  const sandboxId = viewer?.sandboxId ?? null;
  return sandboxId === null ? { sandboxId: null } : { OR: [{ sandboxId: null }, { sandboxId }] };
}

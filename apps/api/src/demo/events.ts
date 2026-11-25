/**
 * Outbox events that drive the demo's seeded people. Written by the marketplace and messaging services
 * (in the same transaction as what triggers them) only for demo sandboxes; handled in ./bots.ts.
 */
export const DEMO_EVENTS = {
  /** A demo visitor published a project: seeded freelancers will answer it. */
  projectPublished: "demo.project_published",
  /** One seeded freelancer's proposal for it, a little later. */
  botProposal: "demo.bot_proposal",
  /** A demo visitor wrote to a seeded person: they answer (a few times). */
  reply: "demo.reply",
} as const;

/** How long the seeded people take: quick enough to see, slow enough to feel like people. */
export const BOT_DELAYS_MS = { proposals: [15_000, 45_000, 90_000], reply: 8_000 } as const;

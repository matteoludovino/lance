import { z } from "zod";

export const DEMO_PERSONAS = ["client", "freelancer", "admin"] as const;
export type DemoPersona = (typeof DEMO_PERSONAS)[number];

export const DEMO_PERSONA_LABELS: Record<DemoPersona, { label: string; description: string }> = {
  client: { label: "Cliente", description: "Publique projetos, receba propostas e pague por etapa." },
  freelancer: { label: "Freelancer", description: "Proponha, entregue e receba na sua carteira." },
  admin: { label: "Admin", description: "Modere denúncias e decida disputas da sua demonstração." },
};

export const demoInput = z.object({ persona: z.enum(DEMO_PERSONAS) });

/** An email the demo's people got: kept for the visitor to read, never sent. */
export interface DemoEmail {
  id: string;
  /** The person it was for. */
  to: string;
  subject: string;
  text: string;
  createdAt: string;
}

import { z } from "zod";

/**
 * Email someone can turn off, by kind. Account email (confirming the address, resetting a password)
 * and moderation notices always go.
 */
export const EMAIL_CATEGORIES = ["proposals", "contracts", "reviews", "messages"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, { label: string; description: string }> = {
  proposals: {
    label: "Propostas",
    description: "Propostas recebidas nos seus projetos, e as suas aceitas ou não escolhidas.",
  },
  contracts: {
    label: "Contratos e pagamentos",
    description: "Depósitos, entregas, aprovações, revisões, disputas e reembolsos.",
  },
  reviews: {
    label: "Avaliações",
    description: "Convites para avaliar e avisos quando uma avaliação sobre você é revelada.",
  },
  messages: {
    label: "Mensagens não lidas",
    description: "Um resumo quando uma conversa fica 10 minutos sem ser lida.",
  },
};

/** true = receives that kind. */
export const emailPreferences = z.object(
  Object.fromEntries(EMAIL_CATEGORIES.map((category) => [category, z.boolean()])) as Record<
    EmailCategory,
    z.ZodBoolean
  >,
);
export type EmailPreferences = z.infer<typeof emailPreferences>;

export const unsubscribeInput = z.object({ token: z.string().min(10).max(300) });

/**
 * The category an unsubscribe link is for, read without checking its signature (the page shows it
 * before asking; the API checks the signature when acting).
 */
export function unsubscribeCategory(token: string): EmailCategory | null {
  const [body] = token.split(".");
  try {
    const decoded = atob((body ?? "").replace(/-/g, "+").replace(/_/g, "/"));
    const category = decoded.split(":")[1];
    return (EMAIL_CATEGORIES as readonly string[]).includes(category ?? "")
      ? (category as EmailCategory)
      : null;
  } catch {
    return null;
  }
}

import type { ProjectInput, ProposalInput } from "@lance/shared";

/** The three people of every demo: one sandbox, one of them signed in at a time. */
export const PERSONAS = {
  client: {
    name: "Renata Alves",
    client: {
      company: "Estúdio Alves",
      about: "Estúdio de cerâmica com loja online e cursos presenciais.",
      city: "Belo Horizonte",
      state: "MG",
    },
  },
  freelancer: {
    name: "Lívia Prado",
    freelancer: {
      headline: "Designer de produto e landing pages",
      bio: "Desenho e monto landing pages que convertem, do wireframe ao site no ar, para pequenos negócios.",
      category: "design",
      skills: ["ui-design", "figma", "ux-research"],
      minBudgetCents: 80_000,
      available: true,
      city: "Recife",
      state: "PE",
    },
  },
  admin: { name: "Moderação da demo" },
} as const;

export type Persona = keyof typeof PERSONAS;

/** Already under way when the demo opens: hired, the first milestone delivered and waiting for approval. */
export const STARTER_PROJECT: ProjectInput = {
  title: "Landing page para o curso de cerâmica",
  description:
    "Uma página de inscrição para o curso de férias: apresentação, programa, fotos das peças e formulário de inscrição ligado ao nosso e-mail.",
  category: "design",
  skills: ["ui-design", "figma"],
  budgetMinCents: 150_000,
  budgetMaxCents: 300_000,
};

export const STARTER_PROPOSAL: ProposalInput = {
  coverLetter:
    "Faço a landing em duas etapas: primeiro o layout no Figma para você aprovar, depois a página no ar com o formulário funcionando.",
  deliveryDays: 12,
  milestones: [
    { title: "Layout no Figma", amountCents: 100_000 },
    { title: "Página no ar", amountCents: 140_000 },
  ],
};

export const STARTER_DELIVERY =
  "Layout pronto: versão desktop e celular, com as fotos que você mandou. O link do Figma está no arquivo da entrega.";

/** Open, so the seeded freelancers send proposals to it a few seconds after the demo starts. */
export const OPEN_PROJECT: ProjectInput = {
  title: "Fotos e descrições para a loja online",
  description:
    "Precisamos de descrições para 40 peças da loja online, com medidas e cuidados de uso, e um padrão para as próximas.",
  category: "redacao",
  skills: ["copywriting", "revisao"],
  budgetMinCents: 120_000,
  budgetMaxCents: 250_000,
};

/** A seeded freelancer's proposal for a visitor's project: priced inside the budget, in two milestones. */
export function botProposal(
  bot: { name: string; headline: string },
  project: { title: string; budgetMinCents: number; budgetMaxCents: number },
  n: number,
): ProposalInput {
  const span = project.budgetMaxCents - project.budgetMinCents;
  // Spread across the budget (cheapest first), in whole tens of reais.
  const price = Math.round((project.budgetMinCents + (span * (n + 1)) / 4) / 1000) * 1000;
  const first = Math.round((price * 0.4) / 1000) * 1000;
  const firstName = bot.name.split(" ")[0];
  return {
    coverLetter: `Olá! Sou ${firstName} (${bot.headline.toLowerCase()}). Li “${project.title}” e consigo entregar em duas etapas: começo pelo que dá para você aprovar rápido e termino com tudo pronto para usar.`,
    deliveryDays: 10 + n * 4,
    milestones: [
      { title: "Primeira entrega para aprovação", amountCents: first },
      { title: "Entrega final", amountCents: price - first },
    ],
  };
}

/** What a seeded person answers in a demo conversation, in order; then they stop. */
export const BOT_REPLIES = [
  "Oi! Obrigado pela mensagem. Se fizer sentido, aceite a proposta: o valor de cada etapa fica guardado no Lance e só é liberado quando você aprovar a entrega.",
  "Consigo ajustar prazo e etapas, sim. Me diga o que é mais importante para você que eu reorganizo a proposta.",
  "Combinado! (Esta é uma conversa de demonstração: as pessoas da vitrine respondem só algumas vezes.)",
];

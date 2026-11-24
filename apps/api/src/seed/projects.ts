import type { ProjectInput } from "@lance/shared";

/** Open projects from the seeded clients (fictional). `daysAgo` places them in the recent past. */
export interface SeedProject {
  key: string;
  client: string;
  daysAgo: number;
  project: ProjectInput;
}

export const SEED_PROJECTS: SeedProject[] = [
  {
    key: "loja-cafe",
    client: "cafe-serra",
    daysAgo: 1,
    project: {
      title: "Loja Shopify com assinatura mensal de café",
      description:
        "Vendemos café torrado direto ao consumidor pelo Instagram e queremos uma loja própria. Precisamos de tema ajustado à marca, cálculo de frete por CEP, cupons e um plano de assinatura mensal (1 kg ou 2 kg). Já temos fotos e textos dos produtos.",
      category: "desenvolvimento",
      skills: ["shopify", "seo"],
      budgetMinCents: 400_000,
      budgetMaxCents: 800_000,
    },
  },
  {
    key: "embalagem-cafe",
    client: "cafe-serra",
    daysAgo: 6,
    project: {
      title: "Rótulos para a nova linha de cafés especiais",
      description:
        "Três rótulos para pacotes de 250 g (um por origem), seguindo a identidade que já temos. Entrega em arquivo pronto para gráfica, com faca especial.",
      category: "design",
      skills: ["ilustracao", "identidade-visual"],
      budgetMinCents: 120_000,
      budgetMaxCents: 250_000,
    },
  },
  {
    key: "agenda-clinica",
    client: "clinica-viver",
    daysAgo: 2,
    project: {
      title: "Agendamento online integrado à agenda das unidades",
      description:
        "Hoje marcamos sessões por telefone. Queremos uma página onde o paciente escolhe unidade, fisioterapeuta e horário, com confirmação por e-mail e lembrete na véspera. A agenda atual fica numa planilha do Google por unidade.",
      category: "desenvolvimento",
      skills: ["react", "node", "automacao"],
      budgetMinCents: 900_000,
      budgetMaxCents: 1_800_000,
    },
  },
  {
    key: "painel-clinica",
    client: "clinica-viver",
    daysAgo: 9,
    project: {
      title: "Painel de ocupação e faltas por unidade no Power BI",
      description:
        "Temos os atendimentos de 2025 em planilhas. Queremos um painel com taxa de ocupação, faltas por dia da semana e receita por convênio, atualizado toda semana.",
      category: "dados",
      skills: ["power-bi", "analise-dados"],
      budgetMinCents: 250_000,
      budgetMaxCents: 500_000,
    },
  },
  {
    key: "ilustracao-livro",
    client: "editora-farol",
    daysAgo: 3,
    project: {
      title: "Ilustrações para livro infantil de 24 páginas",
      description:
        "Livro sobre um farol que conversa com as gaivotas, para crianças de 4 a 7 anos. São 12 ilustrações de página dupla e a capa. O texto está pronto; buscamos traço delicado e cores suaves.",
      category: "design",
      skills: ["ilustracao"],
      budgetMinCents: 600_000,
      budgetMaxCents: 1_200_000,
    },
  },
  {
    key: "revisao-livros",
    client: "editora-farol",
    daysAgo: 12,
    project: {
      title: "Revisão de texto de três livros infantis",
      description:
        "Revisão ortográfica e gramatical de três livros curtos (cerca de 3 mil palavras cada), com atenção ao ritmo de leitura em voz alta.",
      category: "redacao",
      skills: ["revisao"],
      budgetMinCents: 60_000,
      budgetMaxCents: 120_000,
    },
  },
  {
    key: "reels-studio",
    client: "studio-mova",
    daysAgo: 4,
    project: {
      title: "Pacote mensal de reels para estúdio de pilates",
      description:
        "Gravamos os vídeos no estúdio; precisamos de edição de 8 reels por mês com legendas, cortes dinâmicos e trilha. Contrato inicial de um mês, com chance de continuar.",
      category: "video",
      skills: ["edicao-video", "redes-sociais"],
      budgetMinCents: 80_000,
      budgetMaxCents: 160_000,
    },
  },
  {
    key: "app-receitas",
    client: "lucas-pessoal",
    daysAgo: 5,
    project: {
      title: "Protótipo navegável de app de receitas",
      description:
        "Quero validar a ideia com usuários antes de programar. Preciso das telas principais no Figma (busca por ingredientes, receita passo a passo, lista de compras) num protótipo clicável.",
      category: "design",
      skills: ["ui-design", "figma", "ux-research"],
      budgetMinCents: 200_000,
      budgetMaxCents: 400_000,
    },
  },
];

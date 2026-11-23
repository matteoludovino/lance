import type { CategorySlug, ClientProfileInput, FreelancerProfileInput, SkillSlug } from "@lance/shared";

/**
 * The seeded marketplace's people: visible to everyone, owned by no sandbox, unable to sign in (no
 * password). Demo visitors meet them as the other side of the market. All fictional.
 */
export interface SeedFreelancer {
  key: string;
  name: string;
  profile: FreelancerProfileInput & { category: CategorySlug; skills: SkillSlug[] };
}

export interface SeedClient {
  key: string;
  name: string;
  profile: ClientProfileInput;
}

export const SEED_FREELANCERS: SeedFreelancer[] = [
  {
    key: "marina-costa",
    name: "Marina Costa",
    profile: {
      headline: "Desenvolvedora front-end React e Next.js",
      bio: "Construo interfaces web rápidas e acessíveis há sete anos, de landing pages a painéis com muitos dados. Gosto de começar pelo protótipo navegável e entregar em etapas curtas, com tudo testado.",
      category: "desenvolvimento",
      skills: ["react", "nextjs", "typescript"],
      minBudgetCents: 250_000,
      available: true,
      city: "Recife",
      state: "PE",
    },
  },
  {
    key: "rafael-oliveira",
    name: "Rafael Oliveira",
    profile: {
      headline: "Back-end Node.js e PostgreSQL",
      bio: "APIs, integrações com meios de pagamento e ERPs, filas e rotinas agendadas. Já migrei sistemas legados em PHP para Node sem parar a operação. Documentação e testes fazem parte da entrega.",
      category: "desenvolvimento",
      skills: ["node", "typescript", "postgresql", "php"],
      minBudgetCents: 300_000,
      available: true,
      city: "Belo Horizonte",
      state: "MG",
    },
  },
  {
    key: "camila-ferreira",
    name: "Camila Ferreira",
    profile: {
      headline: "Lojas Shopify e WordPress que vendem",
      bio: "Monto e ajusto lojas virtuais para pequenos negócios: tema, frete, meios de pagamento, SEO básico e treinamento para você cuidar da loja sozinho depois.",
      category: "desenvolvimento",
      skills: ["shopify", "wordpress", "seo"],
      minBudgetCents: 120_000,
      available: true,
      city: "Curitiba",
      state: "PR",
    },
  },
  {
    key: "thiago-santos",
    name: "Thiago Santos",
    profile: {
      headline: "Apps mobile em Flutter e React Native",
      bio: "Apps para Android e iOS a partir de um código só, com publicação nas lojas inclusa. Experiência com delivery, agendamento e apps internos de empresas.",
      category: "desenvolvimento",
      skills: ["flutter", "react-native", "typescript"],
      minBudgetCents: 500_000,
      available: false,
      city: "São Paulo",
      state: "SP",
    },
  },
  {
    key: "juliana-almeida",
    name: "Juliana Almeida",
    profile: {
      headline: "UI/UX designer para produtos digitais",
      bio: "Pesquisa com usuários, fluxos, protótipos no Figma e design system pronto para o time de desenvolvimento. Trabalhei com fintechs e healthtechs.",
      category: "design",
      skills: ["ui-design", "ux-research", "figma"],
      minBudgetCents: 280_000,
      available: true,
      city: "Florianópolis",
      state: "SC",
    },
  },
  {
    key: "pedro-henrique",
    name: "Pedro Henrique Rocha",
    profile: {
      headline: "Identidade visual e ilustração",
      bio: "Crio marcas do zero: logotipo, paleta, tipografia e manual de uso. Também faço ilustrações para embalagens, livros e redes sociais.",
      category: "design",
      skills: ["identidade-visual", "ilustracao"],
      minBudgetCents: 90_000,
      available: true,
      city: "Salvador",
      state: "BA",
    },
  },
  {
    key: "larissa-mendes",
    name: "Larissa Mendes",
    profile: {
      headline: "Motion design e vídeos curtos",
      bio: "Animações para redes sociais, vinhetas e vídeos explicativos. Entrego nos formatos de cada plataforma, com legendas.",
      category: "video",
      skills: ["motion", "edicao-video"],
      minBudgetCents: 80_000,
      available: true,
      city: "Rio de Janeiro",
      state: "RJ",
    },
  },
  {
    key: "bruno-carvalho",
    name: "Bruno Carvalho",
    profile: {
      headline: "Tráfego pago e SEO para e-commerce",
      bio: "Campanhas no Google e na Meta com acompanhamento semanal de custo por venda. Auditoria de SEO técnico e plano de conteúdo.",
      category: "marketing",
      skills: ["trafego-pago", "seo", "email-marketing"],
      minBudgetCents: 150_000,
      available: true,
      city: "Porto Alegre",
      state: "RS",
    },
  },
  {
    key: "aline-ribeiro",
    name: "Aline Ribeiro",
    profile: {
      headline: "Social media e calendário de conteúdo",
      bio: "Planejo e produzo posts, stories e reels para pequenas marcas, com calendário mensal e relatório de resultados.",
      category: "marketing",
      skills: ["redes-sociais", "copywriting"],
      minBudgetCents: 60_000,
      available: true,
      city: "Fortaleza",
      state: "CE",
    },
  },
  {
    key: "gustavo-lima",
    name: "Gustavo Lima",
    profile: {
      headline: "Copywriter para páginas de venda e e-mails",
      bio: "Textos que explicam e convencem: páginas de venda, sequências de e-mail e roteiros de vídeo. Revisões incluídas até ficar do seu jeito.",
      category: "redacao",
      skills: ["copywriting", "email-marketing", "artigos"],
      minBudgetCents: 70_000,
      available: true,
      city: "Goiânia",
      state: "GO",
    },
  },
  {
    key: "fernanda-souza",
    name: "Fernanda Souza",
    profile: {
      headline: "Tradução inglês ⇄ português e revisão",
      bio: "Tradução técnica e de marketing, revisão e adaptação de textos. Formada em Letras, com dez anos traduzindo documentação de software.",
      category: "redacao",
      skills: ["traducao-en", "revisao"],
      minBudgetCents: 40_000,
      available: true,
      city: "Campinas",
      state: "SP",
    },
  },
  {
    key: "diego-martins",
    name: "Diego Martins",
    profile: {
      headline: "Dados, Power BI e automações",
      bio: "Painéis em Power BI, limpeza e análise de dados em Python e automações entre planilhas, CRMs e ERPs. Explico os números em linguagem de negócio.",
      category: "dados",
      skills: ["power-bi", "analise-dados", "python", "automacao"],
      minBudgetCents: 200_000,
      available: true,
      city: "Brasília",
      state: "DF",
    },
  },
];

export const SEED_CLIENTS: SeedClient[] = [
  {
    key: "cafe-serra",
    name: "Helena Duarte",
    profile: {
      company: "Café da Serra",
      about: "Torrefação familiar no sul de Minas, vendendo direto para o consumidor.",
      city: "Poços de Caldas",
      state: "MG",
    },
  },
  {
    key: "clinica-viver",
    name: "Roberto Nunes",
    profile: {
      company: "Clínica Viver Bem",
      about: "Clínica de fisioterapia com três unidades, digitalizando o agendamento.",
      city: "Campinas",
      state: "SP",
    },
  },
  {
    key: "editora-farol",
    name: "Patrícia Gomes",
    profile: {
      company: "Editora Farol",
      about: "Editora independente de livros infantis.",
      city: "Recife",
      state: "PE",
    },
  },
  {
    key: "studio-mova",
    name: "André Teixeira",
    profile: {
      company: "Studio Mova",
      about: "Estúdio de pilates e treino funcional.",
      city: "Curitiba",
      state: "PR",
    },
  },
  {
    key: "lucas-pessoal",
    name: "Lucas Araújo",
    profile: {
      company: null,
      about: "Empreendedor tirando um app de receitas do papel.",
      city: null,
      state: "SP",
    },
  },
];

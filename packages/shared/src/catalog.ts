/**
 * The fixed catalog of categories and skills. Profiles and projects pick from it (no free-form tags), so
 * search filters and facets stay meaningful. Slugs are stored; labels are what people read.
 */
export const CATEGORIES = [
  { slug: "desenvolvimento", label: "Desenvolvimento" },
  { slug: "design", label: "Design" },
  { slug: "marketing", label: "Marketing" },
  { slug: "redacao", label: "Redação e tradução" },
  { slug: "video", label: "Vídeo e áudio" },
  { slug: "dados", label: "Dados e IA" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export const SKILLS = [
  { slug: "react", label: "React", category: "desenvolvimento" },
  { slug: "nextjs", label: "Next.js", category: "desenvolvimento" },
  { slug: "typescript", label: "TypeScript", category: "desenvolvimento" },
  { slug: "node", label: "Node.js", category: "desenvolvimento" },
  { slug: "python", label: "Python", category: "desenvolvimento" },
  { slug: "php", label: "PHP", category: "desenvolvimento" },
  { slug: "wordpress", label: "WordPress", category: "desenvolvimento" },
  { slug: "flutter", label: "Flutter", category: "desenvolvimento" },
  { slug: "react-native", label: "React Native", category: "desenvolvimento" },
  { slug: "postgresql", label: "PostgreSQL", category: "desenvolvimento" },
  { slug: "shopify", label: "Shopify", category: "desenvolvimento" },
  { slug: "ui-design", label: "UI design", category: "design" },
  { slug: "ux-research", label: "Pesquisa de UX", category: "design" },
  { slug: "figma", label: "Figma", category: "design" },
  { slug: "identidade-visual", label: "Identidade visual", category: "design" },
  { slug: "ilustracao", label: "Ilustração", category: "design" },
  { slug: "motion", label: "Motion design", category: "design" },
  { slug: "seo", label: "SEO", category: "marketing" },
  { slug: "trafego-pago", label: "Tráfego pago", category: "marketing" },
  { slug: "redes-sociais", label: "Redes sociais", category: "marketing" },
  { slug: "email-marketing", label: "E-mail marketing", category: "marketing" },
  { slug: "copywriting", label: "Copywriting", category: "redacao" },
  { slug: "artigos", label: "Artigos e blog", category: "redacao" },
  { slug: "revisao", label: "Revisão de texto", category: "redacao" },
  { slug: "traducao-en", label: "Tradução inglês ⇄ português", category: "redacao" },
  { slug: "edicao-video", label: "Edição de vídeo", category: "video" },
  { slug: "locucao", label: "Locução", category: "video" },
  { slug: "podcast", label: "Edição de podcast", category: "video" },
  { slug: "analise-dados", label: "Análise de dados", category: "dados" },
  { slug: "power-bi", label: "Power BI", category: "dados" },
  { slug: "machine-learning", label: "Machine learning", category: "dados" },
  { slug: "automacao", label: "Automação e integrações", category: "dados" },
] as const satisfies readonly { slug: string; label: string; category: CategorySlug }[];

export type SkillSlug = (typeof SKILLS)[number]["slug"];

export const CATEGORY_SLUGS = CATEGORIES.map((category) => category.slug) as [
  CategorySlug,
  ...CategorySlug[],
];
export const SKILL_SLUGS = SKILLS.map((skill) => skill.slug) as [SkillSlug, ...SkillSlug[]];

const categoryLabels = new Map<string, string>(CATEGORIES.map((category) => [category.slug, category.label]));
const skillLabels = new Map<string, string>(SKILLS.map((skill) => [skill.slug, skill.label]));

export function categoryLabel(slug: string): string {
  return categoryLabels.get(slug) ?? slug;
}

export function skillLabel(slug: string): string {
  return skillLabels.get(slug) ?? slug;
}

/** Brazilian states (UF), for an optional location. */
export const STATES = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

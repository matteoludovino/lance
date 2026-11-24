/** The seeded marketplace's history: reviews between seeded people (no contracts; always revealed). */
export interface SeedReview {
  author: string;
  reviewee: string;
  role: "client" | "freelancer";
  rating: number;
  comment: string;
  daysAgo: number;
}

const F = (
  reviewee: string,
  author: string,
  rating: number,
  comment: string,
  daysAgo: number,
): SeedReview => ({
  author,
  reviewee,
  role: "freelancer",
  rating,
  comment,
  daysAgo,
});
const C = (
  reviewee: string,
  author: string,
  rating: number,
  comment: string,
  daysAgo: number,
): SeedReview => ({
  author,
  reviewee,
  role: "client",
  rating,
  comment,
  daysAgo,
});

export const SEED_REVIEWS: SeedReview[] = [
  F(
    "marina-costa",
    "cafe-serra",
    5,
    "Entregou o painel antes do prazo e explicou cada decisão. Contrataria de novo.",
    40,
  ),
  F("marina-costa", "clinica-viver", 5, "Código organizado e muito cuidado com acessibilidade.", 95),
  F(
    "marina-costa",
    "lucas-pessoal",
    4,
    "Ótimo trabalho; a última etapa atrasou dois dias, mas avisou com antecedência.",
    160,
  ),
  F(
    "rafael-oliveira",
    "clinica-viver",
    5,
    "Integrou nossa agenda com o sistema antigo sem parar o atendimento.",
    30,
  ),
  F("rafael-oliveira", "cafe-serra", 4, "Resolveu o cálculo de frete; documentação muito boa.", 120),
  F(
    "camila-ferreira",
    "cafe-serra",
    5,
    "A loja ficou linda e ela nos ensinou a cuidar de tudo sozinhos.",
    60,
  ),
  F("camila-ferreira", "studio-mova", 5, "Rápida, atenciosa e muito didática.", 140),
  F("thiago-santos", "lucas-pessoal", 4, "App bem feito; precisei explicar algumas telas duas vezes.", 80),
  F(
    "juliana-almeida",
    "clinica-viver",
    5,
    "A pesquisa com pacientes mudou o desenho do agendamento. Excelente.",
    45,
  ),
  F(
    "juliana-almeida",
    "lucas-pessoal",
    5,
    "Protótipo navegável impecável, testei com usuários no mesmo dia.",
    110,
  ),
  F(
    "pedro-henrique",
    "editora-farol",
    5,
    "As ilustrações deram vida ao livro. Traço delicado e entrega pontual.",
    70,
  ),
  F("pedro-henrique", "cafe-serra", 4, "Marca bonita; a paleta precisou de uma rodada extra.", 200),
  F("larissa-mendes", "studio-mova", 5, "Reels dinâmicos e sempre dentro do prazo combinado.", 25),
  F("bruno-carvalho", "cafe-serra", 4, "Reduziu o custo por venda em dois meses. Relatórios claros.", 55),
  F("aline-ribeiro", "studio-mova", 5, "Calendário organizado e posts com a nossa cara.", 35),
  F("gustavo-lima", "editora-farol", 4, "Textos de venda bons; ajustamos o tom na revisão.", 90),
  F("fernanda-souza", "editora-farol", 5, "Revisão cuidadosa, com comentários que ensinam.", 65),
  F("diego-martins", "clinica-viver", 5, "O painel de ocupação virou ferramenta diária da gerência.", 20),
  F(
    "diego-martins",
    "cafe-serra",
    5,
    "Automatizou nossa planilha de pedidos: economizamos horas por semana.",
    150,
  ),
  C("cafe-serra", "marina-costa", 5, "Briefing claro, feedback rápido e pagamento em dia.", 40),
  C("cafe-serra", "camila-ferreira", 5, "Cliente parceira, sabe o que quer.", 60),
  C("clinica-viver", "rafael-oliveira", 5, "Equipe disponível para testar e decidir rápido.", 30),
  C("editora-farol", "pedro-henrique", 5, "Respeitou o processo criativo e o cronograma.", 70),
  C("studio-mova", "larissa-mendes", 4, "Ótimo cliente; às vezes os vídeos chegavam em cima da hora.", 25),
  C("lucas-pessoal", "thiago-santos", 4, "Ideia clara; mudou o escopo uma vez no meio do caminho.", 80),
];

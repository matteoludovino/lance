import { DemoStart } from "@/components/demo-start";
import { ServerStatus } from "@/components/server-status";
import { ButtonLink } from "@/components/ui/button";

const STEPS = [
  {
    title: "Publique o projeto",
    text: "Diga o que precisa e a faixa de orçamento. Freelancers propõem preço e etapas.",
  },
  {
    title: "Contrate por etapas",
    text: "Você deposita cada etapa antes de ela começar; o valor fica guardado no Lance.",
  },
  {
    title: "Pague só o aprovado",
    text: "Aprove a entrega e o pagamento é liberado. Sem resposta em 7 dias, libera sozinho.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto grid max-w-4xl gap-10 px-4 py-12 sm:py-16">
      <div className="grid gap-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Freelas digitais, pagos por etapa aprovada.
        </h1>
        <p className="max-w-2xl text-lg text-stone-700">
          No Lance, clientes publicam projetos, freelancers propõem preço e etapas, e o dinheiro de cada etapa
          fica guardado até a entrega ser aprovada. Conversa em tempo real, avaliações duplo-cegas e
          moderação.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href="/projetos">Ver projetos</ButtonLink>
          <ButtonLink href="/freelancers" variant="secondary">
            Encontrar freelancers
          </ButtonLink>
          <ButtonLink href="/cadastro" variant="ghost">
            Criar conta
          </ButtonLink>
        </div>
        <ServerStatus />
      </div>
      <DemoStart />
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className="grid content-start gap-1.5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <span className="text-sm font-semibold text-indigo-700">{index + 1}</span>
            <h2 className="font-semibold text-stone-900">{step.title}</h2>
            <p className="text-sm text-stone-600">{step.text}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}

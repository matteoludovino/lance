import { ServerStatus } from "@/components/server-status";
import { ButtonLink } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-3xl content-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Lance</h1>
      <p className="text-lg text-stone-700">
        Freelas digitais do jeito certo: publique um projeto, receba propostas, contrate por etapas e pague só
        quando a entrega for aprovada.
      </p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/cadastro">Criar conta</ButtonLink>
        <ButtonLink href="/entrar" variant="secondary">
          Entrar
        </ButtonLink>
      </div>
      <p className="text-stone-600">Em construção: projetos e propostas chegam na próxima versão.</p>
      <ServerStatus />
    </main>
  );
}

import { ServerStatus } from "@/components/server-status";

export default function Home() {
  return (
    <main className="mx-auto grid min-h-screen max-w-3xl content-center gap-6 px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Lance</h1>
      <p className="text-lg text-stone-700">
        Freelas digitais do jeito certo: publique um projeto, receba propostas, contrate por etapas e pague só
        quando a entrega for aprovada.
      </p>
      <p className="text-stone-600">Em construção: os projetos e as propostas chegam na próxima versão.</p>
      <ServerStatus />
    </main>
  );
}

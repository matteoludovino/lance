"use client";

import { categoryLabel, formatBRL, type Me } from "@lance/shared";
import Link from "next/link";
import { RequireSession } from "@/components/require-session";
import { ButtonLink } from "@/components/ui/button";
import { useMode } from "@/lib/mode";

export function Dashboard() {
  return <RequireSession>{(me) => <DashboardFor me={me} />}</RequireSession>;
}

function DashboardFor({ me }: { me: Me }) {
  const mode = useMode();
  const firstName = me.name.split(" ")[0];
  return (
    <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {firstName}!</h1>
        <p className="text-stone-600">
          {mode === "client"
            ? "Você está no modo Contratar: publique projetos e escolha propostas."
            : "Você está no modo Trabalhar: encontre projetos e envie propostas."}
        </p>
      </div>
      {mode === "client" ? <ClientSide me={me} /> : <FreelancerSide me={me} />}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ClientSide({ me }: { me: Me }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Seu perfil de cliente">
        {me.client ? (
          <>
            <p className="text-stone-700">
              {me.client.company ?? "Pessoa física"}
              {me.client.city ? ` · ${me.client.city}${me.client.state ? `/${me.client.state}` : ""}` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/perfil/editar#cliente" variant="secondary">
                Editar
              </ButtonLink>
              <ButtonLink href={`/clientes/${me.id}`} variant="ghost">
                Ver página pública
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <p className="text-stone-600">
              Conte quem está contratando: ajuda os freelancers a confiar no seu projeto.
            </p>
            <ButtonLink href="/perfil/editar#cliente" className="justify-self-start">
              Criar perfil de cliente
            </ButtonLink>
          </>
        )}
      </Card>
      <Card title="Seus projetos">
        <p className="text-stone-600">
          Publicar projetos e receber propostas chega na próxima versão do Lance.
        </p>
      </Card>
    </div>
  );
}

function FreelancerSide({ me }: { me: Me }) {
  const profile = me.freelancer;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Seu perfil de freelancer">
        {profile ? (
          <>
            <div className="grid gap-1">
              <p className="font-medium text-stone-900">{profile.headline}</p>
              <p className="text-sm text-stone-600">
                {categoryLabel(profile.category)} · projetos a partir de {formatBRL(profile.minBudgetCents)} ·{" "}
                {profile.available ? "disponível" : "agenda cheia"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/perfil/editar#freelancer" variant="secondary">
                Editar
              </ButtonLink>
              <ButtonLink href={`/freelancers/${me.id}`} variant="ghost">
                Ver página pública
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            <p className="text-stone-600">
              Monte seu perfil para aparecer na busca e enviar propostas: o que você faz, suas habilidades e a
              partir de quanto você trabalha.
            </p>
            <ButtonLink href="/perfil/editar#freelancer" className="justify-self-start">
              Criar perfil de freelancer
            </ButtonLink>
          </>
        )}
      </Card>
      <Card title="Propostas">
        <p className="text-stone-600">
          Encontrar projetos e enviar propostas chega na próxima versão. Enquanto isso, veja como ficou{" "}
          {profile ? (
            <Link href={`/freelancers/${me.id}`} className="font-medium text-indigo-700 hover:underline">
              sua página
            </Link>
          ) : (
            "sua página"
          )}
          .
        </p>
      </Card>
    </div>
  );
}

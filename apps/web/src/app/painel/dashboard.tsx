"use client";

import {
  PROJECT_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  categoryLabel,
  formatBRL,
  type Me,
  type MyProposal,
  type ProjectSummary,
} from "@lance/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { money, plural } from "@/lib/format";
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
        <MyProjects />
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
      <Card title="Suas propostas">
        <MyProposals />
      </Card>
    </div>
  );
}

function ListState({
  error,
  empty,
  children,
}: {
  error: boolean;
  empty: React.ReactNode;
  children?: React.ReactNode;
}) {
  if (error) return <p className="text-sm text-red-700">Não foi possível carregar. Recarregue a página.</p>;
  return children ?? <div className="text-stone-600">{empty}</div>;
}

function MyProjects() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["me", "projects"],
    queryFn: () => api<ProjectSummary[]>("/me/projects"),
  });
  if (isPending) return <div aria-busy className="h-16 animate-pulse rounded-lg bg-stone-100" />;
  return (
    <ListState
      error={isError}
      empty={
        <div className="grid gap-3">
          <p>Você ainda não publicou nenhum projeto.</p>
          <ButtonLink href="/projetos/novo" className="justify-self-start">
            Publicar um projeto
          </ButtonLink>
        </div>
      }
    >
      {data && data.length > 0 ? (
        <div className="grid gap-3">
          <ul className="grid divide-y divide-stone-100">
            {data.map((project) => (
              <li key={project.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/projetos/${project.id}`} className="font-medium hover:text-indigo-700">
                  {project.title}
                </Link>
                <span className="text-sm text-stone-500">
                  {PROJECT_STATUS_LABELS[project.status]}
                  {project.status === "open"
                    ? ` · ${plural(project.proposalCount, "proposta", "propostas")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
          <ButtonLink href="/projetos/novo" variant="secondary" className="justify-self-start">
            Publicar outro projeto
          </ButtonLink>
        </div>
      ) : undefined}
    </ListState>
  );
}

function MyProposals() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["me", "proposals"],
    queryFn: () => api<MyProposal[]>("/me/proposals"),
  });
  if (isPending) return <div aria-busy className="h-16 animate-pulse rounded-lg bg-stone-100" />;
  return (
    <ListState
      error={isError}
      empty={
        <div className="grid gap-3">
          <p>Nenhuma proposta enviada ainda.</p>
          <ButtonLink href="/projetos" className="justify-self-start">
            Ver projetos abertos
          </ButtonLink>
        </div>
      }
    >
      {data && data.length > 0 ? (
        <ul className="grid divide-y divide-stone-100">
          {data.map((proposal) => (
            <li key={proposal.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <Link href={`/projetos/${proposal.project.id}`} className="font-medium hover:text-indigo-700">
                {proposal.project.title}
              </Link>
              <span className="text-sm text-stone-500">
                {money(proposal.priceCents)} · {PROPOSAL_STATUS_LABELS[proposal.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : undefined}
    </ListState>
  );
}

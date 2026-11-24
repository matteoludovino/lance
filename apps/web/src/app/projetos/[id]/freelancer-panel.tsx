"use client";

import type { ProjectDetail } from "@lance/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProposalForm } from "@/components/proposal-form";
import { ProposalSummary, StatusBadge } from "@/components/proposal-summary";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { useMe } from "@/lib/session";

const card = "grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm";

/** The side panel for anyone but the owner: sign in, send a proposal, or follow the one sent. */
export function FreelancerPanel({ project }: { project: ProjectDetail }) {
  const { data: me, isPending } = useMe();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const proposal = project.myProposal;
  const open = project.status === "open";

  async function withdraw() {
    setBusy(true);
    setFailure(null);
    try {
      await api(`/proposals/${proposal!.id}/withdraw`, { method: "POST", body: {} });
      router.refresh();
    } catch (error) {
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível retirar.");
    } finally {
      setBusy(false);
    }
  }

  if (isPending) return <div aria-busy className="h-40 animate-pulse rounded-2xl bg-stone-200/70" />;

  if (!me) {
    return open ? (
      <div className={card}>
        <p className="font-medium">Quer este trabalho?</p>
        <p className="text-sm text-stone-600">Entre ou crie uma conta para enviar sua proposta.</p>
        <ButtonLink href={`/entrar?next=${encodeURIComponent(`/projetos/${project.id}`)}`}>
          Entrar para propor
        </ButtonLink>
      </div>
    ) : null;
  }

  if (proposal && proposal.status !== "withdrawn" && !editing) {
    return (
      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">Sua proposta</p>
          <StatusBadge status={proposal.status} />
        </div>
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <ProposalSummary proposal={proposal} />
        {proposal.status === "submitted" && open ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Alterar
            </Button>
            <Button variant="ghost" busy={busy} onClick={withdraw}>
              Retirar proposta
            </Button>
          </div>
        ) : null}
        {proposal.status === "accepted" ? (
          <p className="text-sm text-emerald-800">
            O cliente aceitou: o contrato foi criado com as suas etapas.{" "}
            {project.contractId ? (
              <Link href={`/contratos/${project.contractId}`} className="font-medium underline">
                Ver contrato
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  }

  if (!open) return null;

  if (!me.freelancer) {
    return (
      <div className={card}>
        <p className="font-medium">Quer este trabalho?</p>
        <p className="text-sm text-stone-600">
          Para enviar propostas, monte antes o seu perfil de freelancer.
        </p>
        <ButtonLink href="/perfil/editar#freelancer">Criar perfil de freelancer</ButtonLink>
      </div>
    );
  }

  return (
    <div className={card}>
      <p className="font-medium">
        {proposal && !editing ? "Enviar de novo" : editing ? "Alterar proposta" : "Sua proposta"}
      </p>
      <ProposalForm
        projectId={project.id}
        budgetMinCents={project.budgetMinCents}
        budgetMaxCents={project.budgetMaxCents}
        proposal={editing ? proposal! : undefined}
        onDone={editing ? () => setEditing(false) : undefined}
      />
    </div>
  );
}

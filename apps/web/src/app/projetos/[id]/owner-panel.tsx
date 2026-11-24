"use client";

import type { ProjectDetail, ProposalView } from "@lance/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProposalSummary, StatusBadge } from "@/components/proposal-summary";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { ago, money, plural } from "@/lib/format";

/** What the project's owner does: publish, edit, close, and decide on proposals. */
export function OwnerPanel({
  project,
  proposals,
}: {
  project: ProjectDetail;
  proposals: ProposalView[] | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [accepting, setAccepting] = useState<ProposalView | null>(null);

  async function act(key: string, path: string, body?: unknown) {
    setBusy(key);
    setFailure(null);
    try {
      await api(path, { method: "POST", body: body ?? {} });
      setAccepting(null);
      setClosing(false);
      router.refresh();
    } catch (error) {
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível concluir.");
      // Close the dialog: it shows what the client saw, and the message belongs next to the list.
      setAccepting(null);
      setClosing(false);
      // Something changed meanwhile (a new version, another decision): show the current state.
      if (error instanceof ApiFailure && error.status === 409) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const editable = project.status === "draft" || project.status === "open";
  const pending = proposals?.filter((p) => p.status === "submitted") ?? [];

  return (
    <section className="grid gap-4" aria-labelledby="owner-heading">
      <h2 id="owner-heading" className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
        {project.status === "draft" ? "Rascunho" : `Propostas (${proposals?.length ?? 0})`}
      </h2>
      {failure ? <Notice tone="error">{failure}</Notice> : null}
      {editable ? (
        <div className="flex flex-wrap gap-2">
          {project.status === "draft" ? (
            <Button
              busy={busy === "publish"}
              onClick={() => act("publish", `/projects/${project.id}/publish`)}
            >
              Publicar projeto
            </Button>
          ) : null}
          <ButtonLink href={`/projetos/${project.id}/editar`} variant="secondary">
            Editar
          </ButtonLink>
          <Button variant="ghost" onClick={() => setClosing(true)}>
            Encerrar sem contratar
          </Button>
        </div>
      ) : null}
      {project.status !== "draft" && proposals?.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-600">
          Nenhuma proposta ainda. Freelancers costumam responder nos primeiros dias.
        </p>
      ) : null}
      {proposals === null && project.status !== "draft" ? (
        <Notice tone="error">Não foi possível carregar as propostas. Recarregue a página.</Notice>
      ) : null}
      {proposals?.map((proposal) => (
        <article
          key={proposal.id}
          className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
        >
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold">
                <Link href={`/freelancers/${proposal.freelancer.id}`} className="hover:text-indigo-700">
                  {proposal.freelancer.name}
                </Link>
              </h3>
              <p className="text-sm text-stone-500">
                {proposal.freelancer.headline ? `${proposal.freelancer.headline} · ` : ""}enviada{" "}
                {ago(proposal.submittedAt)}
              </p>
            </div>
            <StatusBadge status={proposal.status} />
          </header>
          <ProposalSummary proposal={proposal} />
          {proposal.status === "submitted" && project.status === "open" ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setAccepting(proposal)}>Aceitar proposta</Button>
              {proposal.conversationId ? (
                <ButtonLink href={`/mensagens/${proposal.conversationId}`} variant="secondary">
                  Conversar
                </ButtonLink>
              ) : null}
              <Button
                variant="ghost"
                busy={busy === `decline:${proposal.id}`}
                onClick={() => act(`decline:${proposal.id}`, `/proposals/${proposal.id}/decline`)}
              >
                Recusar
              </Button>
            </div>
          ) : null}
        </article>
      ))}

      <Dialog open={accepting !== null} onClose={() => setAccepting(null)} title="Aceitar esta proposta?">
        {accepting ? (
          <>
            <p className="text-stone-700">
              Você vai contratar <strong>{accepting.freelancer.name}</strong> por{" "}
              <strong>{money(accepting.priceCents)}</strong>, em{" "}
              {plural(accepting.milestones.length, "etapa", "etapas")}.
              {pending.length > 1
                ? ` ${pending.length - 1 === 1 ? "A outra proposta será recusada" : `As outras ${pending.length - 1} propostas serão recusadas`}.`
                : ""}
            </p>
            <p className="text-sm text-stone-600">
              Nada é cobrado agora: você deposita cada etapa antes de o trabalho dela começar, e o valor só
              vai para o freelancer quando você aprovar a entrega.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setAccepting(null)}>
                Voltar
              </Button>
              <Button
                busy={busy === "accept"}
                onClick={() =>
                  act("accept", `/proposals/${accepting.id}/accept`, { version: accepting.version })
                }
              >
                Aceitar e criar contrato
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>

      <Dialog open={closing} onClose={() => setClosing(false)} title="Encerrar sem contratar?">
        <p className="text-stone-700">
          O projeto sai da lista
          {pending.length > 0
            ? ` e ${plural(pending.length, "proposta pendente será recusada", "propostas pendentes serão recusadas")}`
            : ""}
          . Não dá para desfazer.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setClosing(false)}>
            Voltar
          </Button>
          <Button busy={busy === "close"} onClick={() => act("close", `/projects/${project.id}/close`)}>
            Encerrar projeto
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

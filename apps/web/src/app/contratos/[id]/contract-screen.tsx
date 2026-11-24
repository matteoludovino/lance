"use client";

import {
  CONTRACT_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  type ContractView,
  type MilestoneActionResult,
  type MilestoneView,
} from "@lance/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { RequireSession } from "@/components/require-session";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { dateTime, inTime, money, plural } from "@/lib/format";
import { ReviewSection } from "./review-section";

export function ContractScreen({ id }: { id: string }) {
  return <RequireSession>{() => <Contract id={id} />}</RequireSession>;
}

const TONES: Record<MilestoneView["status"], string> = {
  pending_funding: "bg-amber-50 text-amber-900",
  funded: "bg-indigo-50 text-indigo-800",
  submitted: "bg-sky-50 text-sky-900",
  revision_requested: "bg-amber-50 text-amber-900",
  disputed: "bg-red-50 text-red-800",
  released: "bg-emerald-50 text-emerald-800",
  refunded: "bg-stone-100 text-stone-700",
  cancelled: "bg-stone-100 text-stone-600",
};

function Contract({ id }: { id: string }) {
  const {
    data: contract,
    error,
    isPending,
  } = useQuery({
    queryKey: ["contract", id],
    queryFn: () => api<ContractView>(`/contracts/${id}`),
    retry: (count, failure) => !(failure instanceof ApiFailure && failure.status < 500) && count < 3,
  });

  if (isPending) return <div aria-busy className="h-64 animate-pulse rounded-2xl bg-stone-200/70" />;
  if (error || !contract) {
    return (
      <Notice tone="error">
        {error instanceof ApiFailure && error.status === 404
          ? "Contrato não encontrado."
          : "Não foi possível carregar o contrato. Recarregue a página."}
      </Notice>
    );
  }

  const other = contract.role === "client" ? contract.freelancer : contract.client;
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <p className="text-sm font-medium text-indigo-700">
          Contrato · {CONTRACT_STATUS_LABELS[contract.status]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          <Link href={`/projetos/${contract.project.id}`} className="hover:text-indigo-700">
            {contract.project.title}
          </Link>
        </h1>
        <p className="text-sm text-stone-600">
          {contract.role === "admin" ? (
            <>
              {contract.client.name} (cliente) e {contract.freelancer.name} (freelancer)
            </>
          ) : (
            <>
              Com{" "}
              <Link
                href={contract.role === "client" ? `/freelancers/${other.id}` : `/clientes/${other.id}`}
                className="font-medium text-stone-800 hover:underline"
              >
                {other.name}
              </Link>
            </>
          )}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total label="Valor do contrato" value={money(contract.priceCents)} />
        <Total label="Em custódia" value={money(contract.totals.heldCents)} />
        <Total label="Pago" value={money(contract.totals.releasedCents)} />
        <Total label="Reembolsado" value={money(contract.totals.refundedCents)} />
      </dl>

      <Notice tone="info">
        Pagamento simulado: nenhum cartão é cobrado. O depósito de cada etapa fica em custódia e só vai para o
        freelancer quando o cliente aprova a entrega, ou sozinho{" "}
        {plural(Math.round(contract.autoReleaseHours / 24), "dia", "dias")} depois dela. O Lance retém{" "}
        {contract.feeBps / 100}% de cada etapa paga.
      </Notice>

      {contract.status === "completed" ? <ReviewSection contract={contract} /> : null}

      <section aria-labelledby="milestones-heading" className="grid gap-4">
        <h2 id="milestones-heading" className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
          Etapas
        </h2>
        <ol className="grid gap-4">
          {contract.milestones.map((milestone) => (
            <li key={milestone.id}>
              <Milestone contract={contract} milestone={milestone} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

type Prompt = "submit" | "revision" | "dispute";
type Confirm = "fund" | "approve" | "cancel" | "release" | "refund";

/** One milestone: what happened, and what the viewer can do now. */
function Milestone({ contract, milestone }: { contract: ContractView; milestone: MilestoneView }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string | null>(null);
  // A retry key per decision: a repeated click or a retry after a network error moves the money once.
  const [retryKey, setRetryKey] = useState("");

  const { role, status } = { role: contract.role, status: milestone.status };
  const active = contract.status === "active";
  const neverDelivered = milestone.submittedAt === null;
  const base = `/milestones/${milestone.id}`;

  async function run(path: string, body?: unknown, key?: string) {
    setBusy(true);
    setFailure(null);
    try {
      await api<MilestoneActionResult>(path, {
        method: "POST",
        body: body ?? {},
        headers: key ? { "idempotency-key": key } : undefined,
      });
      setPrompt(null);
      setConfirm(null);
      setText("");
    } catch (error) {
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível concluir.");
      setPrompt(null);
      setConfirm(null);
    } finally {
      setBusy(false);
      await client.invalidateQueries({ queryKey: ["contract", contract.id] });
      await client.invalidateQueries({ queryKey: ["me"] });
    }
  }

  function ask(next: Confirm) {
    setRetryKey(crypto.randomUUID());
    setConfirm(next);
  }

  function open(next: Prompt) {
    setText("");
    setTextError(null);
    setPrompt(next);
  }

  function sendText() {
    const min = prompt === "dispute" ? 20 : 10;
    if (text.trim().length < min) {
      setTextError(`Escreva pelo menos ${min} caracteres.`);
      return;
    }
    if (prompt === "submit") void run(`${base}/submit`, { note: text });
    if (prompt === "revision") void run(`${base}/request-revision`, { note: text });
    if (prompt === "dispute") void run(`${base}/dispute`, { reason: text });
  }

  const actions: ReactNode[] = [];
  if (active && role === "client") {
    if (status === "pending_funding")
      actions.push(
        <Button key="fund" onClick={() => ask("fund")}>
          Depositar {money(milestone.amountCents)}
        </Button>,
      );
    if (status === "submitted") {
      actions.push(
        <Button key="approve" onClick={() => ask("approve")}>
          Aprovar e pagar
        </Button>,
      );
      if (milestone.revisionsLeft > 0) {
        actions.push(
          <Button key="revision" variant="secondary" onClick={() => open("revision")}>
            Pedir revisão ({milestone.revisionsLeft}{" "}
            {milestone.revisionsLeft === 1 ? "restante" : "restantes"})
          </Button>,
        );
      }
    }
  }
  if (active && role === "freelancer" && (status === "funded" || status === "revision_requested")) {
    actions.push(
      <Button key="submit" onClick={() => open("submit")}>
        {status === "funded" ? "Entregar etapa" : "Entregar de novo"}
      </Button>,
    );
  }
  if (active && role !== "admin") {
    if (status === "pending_funding" || (status === "funded" && neverDelivered)) {
      actions.push(
        <Button key="cancel" variant="ghost" onClick={() => ask("cancel")}>
          {status === "funded" ? "Cancelar e reembolsar" : "Cancelar etapa"}
        </Button>,
      );
    }
    if (status === "funded" || status === "submitted" || status === "revision_requested") {
      actions.push(
        <Button key="dispute" variant="ghost" onClick={() => open("dispute")}>
          Abrir disputa
        </Button>,
      );
    }
  }
  if (role === "admin" && status === "disputed") {
    actions.push(
      <Button key="release" onClick={() => ask("release")}>
        Liberar ao freelancer
      </Button>,
      <Button key="refund" variant="secondary" onClick={() => ask("refund")}>
        Reembolsar o cliente
      </Button>,
    );
  }

  const confirmCopy: Record<Confirm, { title: string; body: ReactNode; action: string; go: () => void }> = {
    fund: {
      title: `Depositar ${money(milestone.amountCents)}?`,
      body: "O valor fica em custódia no Lance: o freelancer começa a etapa sabendo que o dinheiro existe, e só recebe quando você aprovar a entrega. (Simulado: nenhum cartão é cobrado.)",
      action: "Depositar",
      go: () => run(`${base}/fund`, undefined, retryKey),
    },
    approve: {
      title: "Aprovar a entrega e pagar?",
      body: `${contract.freelancer.name} recebe ${money(milestone.payoutCents)} (o valor da etapa menos a taxa de ${money(milestone.feeCents)}). Não dá para desfazer.`,
      action: "Aprovar e pagar",
      go: () => run(`${base}/approve`, undefined, retryKey),
    },
    cancel: {
      title: "Cancelar esta etapa?",
      body:
        status === "funded"
          ? `Nada foi entregue ainda: ${money(milestone.amountCents)} voltam para o cliente.`
          : "A etapa ainda não foi depositada; ela sai do contrato.",
      action: "Cancelar etapa",
      go: () => run(`${base}/cancel`),
    },
    release: {
      title: "Liberar o pagamento ao freelancer?",
      body: `${money(milestone.payoutCents)} vão para ${contract.freelancer.name}; a decisão é final.`,
      action: "Liberar",
      go: () => run(`/admin/milestones/${milestone.id}/resolve`, { outcome: "release" }),
    },
    refund: {
      title: "Reembolsar o cliente?",
      body: `${money(milestone.amountCents)} voltam para ${contract.client.name}; a decisão é final.`,
      action: "Reembolsar",
      go: () => run(`/admin/milestones/${milestone.id}/resolve`, { outcome: "refund" }),
    },
  };

  const promptCopy: Record<Prompt, { title: string; label: string; hint: string; action: string }> = {
    submit: {
      title: "Entregar a etapa",
      label: "O que você entregou",
      hint: "Descreva a entrega e onde encontrá-la (link, arquivo, acesso).",
      action: "Enviar entrega",
    },
    revision: {
      title: "Pedir uma revisão",
      label: "O que precisa mudar",
      hint: "Seja específico: o freelancer entrega de novo a partir deste pedido.",
      action: "Pedir revisão",
    },
    dispute: {
      title: "Abrir uma disputa",
      label: "O que aconteceu",
      hint: "A equipe do Lance analisa e decide: pagar o freelancer ou reembolsar o cliente. O prazo automático para.",
      action: "Abrir disputa",
    },
  };

  return (
    <article className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <h3 className="font-semibold">
            <span className="text-stone-500">{milestone.position}.</span> {milestone.title}
          </h3>
          <p className="text-sm text-stone-600">
            {money(milestone.amountCents)}
            {role !== "client" ? ` · você recebe ${money(milestone.payoutCents)}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${TONES[status]}`}>
          {MILESTONE_STATUS_LABELS[status]}
        </span>
      </header>

      <Timeline milestone={milestone} />
      {failure ? <Notice tone="error">{failure}</Notice> : null}
      {actions.length > 0 ? <div className="flex flex-wrap gap-2">{actions}</div> : null}

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? confirmCopy[confirm].title : ""}
      >
        {confirm ? (
          <>
            <p className="text-stone-700">{confirmCopy[confirm].body}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Voltar
              </Button>
              <Button busy={busy} onClick={confirmCopy[confirm].go}>
                {confirmCopy[confirm].action}
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={prompt !== null}
        onClose={() => setPrompt(null)}
        title={prompt ? promptCopy[prompt].title : ""}
      >
        {prompt ? (
          <>
            {prompt === "submit" && milestone.revisionNote && status === "revision_requested" ? (
              <Notice tone="info">Pedido de revisão: {milestone.revisionNote}</Notice>
            ) : null}
            <TextArea
              label={promptCopy[prompt].label}
              hint={promptCopy[prompt].hint}
              rows={5}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setTextError(null);
              }}
              error={textError ?? undefined}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setPrompt(null)}>
                Voltar
              </Button>
              <Button busy={busy} onClick={sendText}>
                {promptCopy[prompt].action}
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </article>
  );
}

/** What happened to the milestone so far, in order. */
function Timeline({ milestone }: { milestone: MilestoneView }) {
  const items: { when: string; text: ReactNode }[] = [];
  if (milestone.fundedAt) items.push({ when: milestone.fundedAt, text: "Depositada pelo cliente" });
  if (milestone.submittedAt && milestone.deliveryNote) {
    items.push({ when: milestone.submittedAt, text: <>Entrega: {milestone.deliveryNote}</> });
  }
  if (milestone.revisionNote && milestone.status === "revision_requested") {
    items.push({ when: milestone.submittedAt ?? "", text: <>Revisão pedida: {milestone.revisionNote}</> });
  }
  if (milestone.dispute) {
    items.push({
      when: milestone.dispute.at,
      text: (
        <>
          Disputa aberta pelo {milestone.dispute.by === "client" ? "cliente" : "freelancer"}:{" "}
          {milestone.dispute.reason}
        </>
      ),
    });
  }
  if (milestone.status === "submitted" && milestone.releaseDueAt) {
    items.push({
      when: "",
      text: (
        <span className="text-sky-900">
          Sem resposta, o pagamento é liberado sozinho {inTime(milestone.releaseDueAt)} (
          {dateTime(milestone.releaseDueAt)}).
        </span>
      ),
    });
  }
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-1.5 border-l-2 border-stone-200 pl-4 text-sm text-stone-700">
      {items.map((item, index) => (
        <li key={index} className="whitespace-pre-line">
          {item.when ? <span className="text-stone-500">{dateTime(item.when)} · </span> : null}
          {item.text}
        </li>
      ))}
    </ul>
  );
}

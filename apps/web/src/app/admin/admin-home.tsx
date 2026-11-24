"use client";

import {
  AUDIT_ACTION_LABELS,
  REPORT_REASON_LABELS,
  REPORT_TARGET_LABELS,
  type AuditEntryView,
  type DisputeView,
  type ReportView,
} from "@lance/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { ago, dateTime, money } from "@/lib/format";
import { AdminOnly } from "./admin-only";

const TABS = [
  { id: "open", label: "Denúncias abertas" },
  { id: "closed", label: "Resolvidas" },
  { id: "disputes", label: "Disputas" },
  { id: "audit", label: "Auditoria" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function AdminHome() {
  return (
    <AdminOnly>
      {(me) => (
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
            <p className="text-stone-600">
              {me.demo
                ? "Você modera só o que foi criado nesta demonstração."
                : "Denúncias, disputas e o registro de tudo o que a administração fez."}
            </p>
          </div>
          <LedgerHealth />
          <Tabs />
        </main>
      )}
    </AdminOnly>
  );
}

/** Tabs as the ARIA pattern has them: arrow keys move between tabs, Tab goes into the panel. */
function Tabs() {
  const [tab, setTab] = useState<Tab>("open");
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    // From the focused tab (not state): presses faster than a render still each move one step.
    const focused = TABS.findIndex((t) => `tab-${t.id}` === document.activeElement?.id);
    const index = focused >= 0 ? focused : TABS.findIndex((t) => t.id === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length]!.id;
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }
  return (
    <div className="grid gap-4">
      <div
        role="tablist"
        aria-label="Seções"
        onKeyDown={keys}
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-stone-200"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls="admin-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-stone-600 hover:text-stone-900 aria-selected:border-indigo-600 aria-selected:font-medium aria-selected:text-indigo-700"
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="admin-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="grid gap-3">
        {tab === "open" || tab === "closed" ? <Reports status={tab} /> : null}
        {tab === "disputes" ? <Disputes /> : null}
        {tab === "audit" ? <AuditLog /> : null}
      </div>
    </div>
  );
}

function LedgerHealth() {
  const { data } = useQuery({
    queryKey: ["admin", "reconciliation"],
    queryFn: () => api<{ ok: boolean; problems: unknown[] }>("/admin/reconciliation"),
  });
  if (!data) return null;
  return data.ok ? (
    <Notice tone="success">Dinheiro conferido: o ledger bate com todas as etapas.</Notice>
  ) : (
    <Notice tone="error">
      A conferência do ledger achou {data.problems.length} problema(s). Veja /api/admin/reconciliation.
    </Notice>
  );
}

function Loading() {
  return <div aria-busy className="h-32 animate-pulse rounded-2xl bg-stone-200/70" />;
}

function Empty({ children }: { children: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-600">
      {children}
    </p>
  );
}

const RESOLUTION: Record<string, string> = {
  hidden: "Conteúdo ocultado",
  suspended: "Autor suspenso",
  dismissed: "Descartada",
};

function Reports({ status }: { status: "open" | "closed" }) {
  const { data, error } = useQuery({
    queryKey: ["admin", "reports", status],
    queryFn: () => api<ReportView[]>(`/admin/reports?status=${status}`),
  });
  if (error) return <Notice tone="error">Não foi possível carregar as denúncias.</Notice>;
  if (!data) return <Loading />;
  if (data.length === 0)
    return <Empty>{status === "open" ? "Nenhuma denúncia esperando. 🎉" : "Nada resolvido ainda."}</Empty>;
  return (
    <ul className="grid gap-3">
      {data.map((report) => (
        <li key={report.id}>
          <article className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium text-stone-700">
                {REPORT_TARGET_LABELS[report.targetType]}
              </span>
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-800">
                {REPORT_REASON_LABELS[report.reason]}
              </span>
              {report.target.hidden ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">oculto</span>
              ) : null}
              {report.target.author.suspended ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">autor suspenso</span>
              ) : null}
              {report.sameTarget > 0 ? (
                <span className="text-stone-500">+{report.sameTarget} outra(s) denúncia(s) disto</span>
              ) : null}
            </div>
            <h2 className="font-semibold text-stone-900">
              <Link href={`/admin/denuncias/${report.id}`} className="hover:text-indigo-700 hover:underline">
                {report.target.label}
              </Link>
            </h2>
            {report.details ? <p className="text-sm text-stone-700">“{report.details}”</p> : null}
            <p className="text-sm text-stone-500">
              {report.reporter ? `Denunciado por ${report.reporter.name}` : "Detectado automaticamente"} ·{" "}
              {ago(report.createdAt)} · autor: {report.target.author.name}
              {report.resolution ? ` · ${RESOLUTION[report.resolution]}` : ""}
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}

function Disputes() {
  const queries = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ["admin", "disputes"],
    queryFn: () => api<DisputeView[]>("/admin/disputes"),
  });
  const [deciding, setDeciding] = useState<{ dispute: DisputeView; outcome: "release" | "refund" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (error) return <Notice tone="error">Não foi possível carregar as disputas.</Notice>;
  if (!data) return <Loading />;

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    setFailure(null);
    try {
      await api(`/admin/milestones/${deciding.dispute.milestoneId}/resolve`, {
        body: { outcome: deciding.outcome },
      });
      setDeciding(null);
      await queries.invalidateQueries({ queryKey: ["admin"] });
    } catch (problem) {
      setFailure(problem instanceof ApiFailure ? problem.message : "Não foi possível decidir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {data.length === 0 ? <Empty>Nenhuma disputa esperando decisão.</Empty> : null}
      <ul className="grid gap-3">
        {data.map((dispute) => (
          <li key={dispute.milestoneId}>
            <article className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-stone-900">
                Etapa “{dispute.title}” · {money(dispute.amountCents)}
              </h2>
              <p className="text-sm text-stone-600">
                <Link href={`/contratos/${dispute.contract.id}`} className="text-indigo-700 hover:underline">
                  {dispute.contract.project.title}
                </Link>{" "}
                · cliente {dispute.client.name} · freelancer {dispute.freelancer.name}
              </p>
              {dispute.reason ? (
                <p className="text-sm text-stone-800">
                  {dispute.disputedBy.name}: “{dispute.reason}”
                </p>
              ) : null}
              <p className="text-xs text-stone-500">Aberta {ago(dispute.disputedAt)}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setDeciding({ dispute, outcome: "release" })}>
                  Liberar para o freelancer
                </Button>
                <Button variant="secondary" onClick={() => setDeciding({ dispute, outcome: "refund" })}>
                  Reembolsar o cliente
                </Button>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <Dialog
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding?.outcome === "release" ? "Liberar o pagamento?" : "Reembolsar o cliente?"}
      >
        {deciding ? (
          <>
            {failure ? <Notice tone="error">{failure}</Notice> : null}
            <p className="text-stone-700">
              {deciding.outcome === "release"
                ? `${money(deciding.dispute.amountCents)} vão para ${deciding.dispute.freelancer.name} (menos a taxa).`
                : `${money(deciding.dispute.amountCents)} voltam para ${deciding.dispute.client.name}.`}{" "}
              A decisão é final e fica no registro de auditoria.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeciding(null)}>
                Voltar
              </Button>
              <Button busy={busy} onClick={decide}>
                {deciding.outcome === "release" ? "Liberar" : "Reembolsar"}
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </>
  );
}

const TARGET_NAMES: Record<string, string> = {
  project: "projeto",
  profile: "perfil",
  message: "mensagem",
  review: "avaliação",
  milestone: "etapa",
};

function AuditLog() {
  const { data, error } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () => api<AuditEntryView[]>("/admin/audit"),
  });
  if (error) return <Notice tone="error">Não foi possível carregar o registro.</Notice>;
  if (!data) return <Loading />;
  if (data.length === 0) return <Empty>Nada registrado ainda.</Empty>;
  return (
    <ol className="grid divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white shadow-sm">
      {data.map((entry) => (
        <li key={entry.id} className="grid gap-0.5 px-4 py-3 text-sm sm:grid-cols-[11rem_1fr]">
          <time dateTime={entry.createdAt} className="text-stone-500">
            {dateTime(entry.createdAt)}
          </time>
          <p className="text-stone-800">
            <span className="font-medium">{entry.actor.name}</span>{" "}
            {(AUDIT_ACTION_LABELS[entry.action] ?? entry.action).toLowerCase()}
            <span className="text-stone-500">
              {" "}
              · {TARGET_NAMES[entry.targetType] ?? entry.targetType}
              {typeof entry.details["note"] === "string" ? ` · “${entry.details["note"]}”` : ""}
              {typeof entry.details["outcome"] === "string"
                ? entry.details["outcome"] === "release"
                  ? " · liberada ao freelancer"
                  : " · reembolsada ao cliente"
                : ""}
            </span>
          </p>
        </li>
      ))}
    </ol>
  );
}

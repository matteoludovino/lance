"use client";

import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_LABELS,
  type ModerationAction,
  type ReportDetail,
  type ReportView,
} from "@lance/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { AdminOnly } from "../../admin-only";

const ACTIONS: Record<
  ModerationAction,
  { label: string; confirm: string; variant: "primary" | "secondary" }
> = {
  hide: {
    label: "Ocultar conteúdo",
    confirm: "Some de todas as listas e páginas. Todas as denúncias abertas sobre isto são fechadas.",
    variant: "primary",
  },
  suspend: {
    label: "Suspender autor",
    confirm:
      "A pessoa sai de todos os dispositivos, não consegue entrar e some das listas. Use para golpes e abusos graves.",
    variant: "secondary",
  },
  dismiss: {
    label: "Descartar denúncia",
    confirm: "Nada muda no conteúdo; só esta denúncia é fechada.",
    variant: "secondary",
  },
};

const LABELS: Record<string, string> = {
  hidden: "conteúdo ocultado",
  suspended: "autor suspenso",
  dismissed: "denúncia descartada",
};

export function ReportScreen({ id }: { id: string }) {
  return <AdminOnly>{() => <Screen id={id} />}</AdminOnly>;
}

function Screen({ id }: { id: string }) {
  const queries = useQueryClient();
  // Opening a report is audited: fetch it once, not on every focus.
  const { data, error } = useQuery({
    queryKey: ["admin", "report", id],
    queryFn: () => api<ReportDetail>(`/admin/reports/${id}`),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [action, setAction] = useState<ModerationAction | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Notice tone="error">
          {error instanceof ApiFailure ? error.message : "Não foi possível abrir."}
        </Notice>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div aria-busy className="h-64 animate-pulse rounded-2xl bg-stone-200/70" />
      </main>
    );
  }

  async function run(path: string, body?: object) {
    setBusy(true);
    setFailure(null);
    try {
      const view = await api<ReportView>(path, { body: body ?? {} });
      queries.setQueryData<ReportDetail>(
        ["admin", "report", id],
        (current) => current && { ...current, ...view },
      );
      void queries.invalidateQueries({ queryKey: ["admin", "reports"] });
      void queries.invalidateQueries({ queryKey: ["admin", "audit"] });
      setAction(null);
      setNote("");
    } catch (problem) {
      setFailure(problem instanceof ApiFailure ? problem.message : "Não foi possível concluir.");
      setAction(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
      <div className="grid gap-1">
        <Link href="/admin" className="text-sm text-stone-600 hover:underline">
          ← Administração
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {REPORT_TARGET_LABELS[data.targetType]}: {data.target.label}
        </h1>
        <p className="text-sm text-stone-500">
          {REPORT_STATUS_LABELS[data.status]}
          {data.resolution ? ` · ${LABELS[data.resolution]}` : ""}
          {data.resolvedAt ? ` em ${dateTime(data.resolvedAt)}` : ""}
        </p>
      </div>
      {failure ? <Notice tone="error">{failure}</Notice> : null}
      <section className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-stone-500">Denúncia</h2>
        <p className="font-medium text-red-800">{REPORT_REASON_LABELS[data.reason]}</p>
        {data.details ? <p className="text-stone-800">“{data.details}”</p> : null}
        <p className="text-sm text-stone-500">
          {data.reporter ? `Por ${data.reporter.name}` : "Detectado automaticamente"} em{" "}
          {dateTime(data.createdAt)}
          {data.sameTarget > 0 ? ` · mais ${data.sameTarget} denúncia(s) aberta(s) sobre isto` : ""}
        </p>
      </section>
      <section className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-stone-500">Conteúdo denunciado</h2>
        <p className="whitespace-pre-wrap text-stone-900">{data.content ?? "(sem texto)"}</p>
        {data.contactFlags.length > 0 ? (
          <p className="text-sm text-amber-900">Contato detectado: {data.contactFlags.join(", ")}</p>
        ) : null}
        <p className="text-sm text-stone-500">
          Autor: {data.target.author.name}
          {data.target.author.suspended ? " (suspenso)" : ""}
          {data.target.hidden ? " · conteúdo oculto" : ""}
          {data.target.url ? (
            <>
              {" · "}
              <Link href={data.target.url} className="text-indigo-700 hover:underline">
                ver no site
              </Link>
            </>
          ) : null}
        </p>
        <p className="text-xs text-stone-500">Abrir esta denúncia ficou no registro de auditoria.</p>
      </section>
      {data.status === "open" ? (
        <section className="grid gap-3">
          <TextArea
            label="Nota interna (opcional)"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            hint="Fica no registro de auditoria, junto com a decisão."
          />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACTIONS) as ModerationAction[]).map((key) => (
              <Button key={key} variant={ACTIONS[key].variant} onClick={() => setAction(key)}>
                {ACTIONS[key].label}
              </Button>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-3">
          {data.note ? <p className="text-sm text-stone-700">Nota: “{data.note}”</p> : null}
          <Button variant="secondary" busy={busy} onClick={() => run(`/admin/reports/${id}/reopen`)}>
            Desfazer decisão
          </Button>
        </section>
      )}
      <Dialog
        open={action !== null}
        onClose={() => setAction(null)}
        title={action ? `${ACTIONS[action].label}?` : ""}
      >
        {action ? (
          <>
            <p className="text-stone-700">{ACTIONS[action].confirm}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setAction(null)}>
                Voltar
              </Button>
              <Button busy={busy} onClick={() => run(`/admin/reports/${id}/resolve`, { action, note })}>
                {ACTIONS[action].label}
              </Button>
            </div>
          </>
        ) : null}
      </Dialog>
    </main>
  );
}

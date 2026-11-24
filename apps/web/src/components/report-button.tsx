"use client";

import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason, type ReportTarget } from "@lance/shared";
import { useId, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useMe } from "@/lib/session";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { TextArea } from "./ui/field";
import { Notice } from "./ui/notice";

const WHAT: Record<ReportTarget, string> = {
  project: "projeto",
  profile: "perfil",
  message: "mensagem",
  review: "avaliação",
};

/**
 * "Denunciar": for signed-in people, on something someone else wrote. The report goes to moderation;
 * the person reported isn't told who reported them.
 */
export function ReportButton({
  targetType,
  targetId,
  ownerId,
  label,
  className = "",
}: {
  targetType: ReportTarget;
  targetId: string;
  /** Who wrote it: they don't get the button. */
  ownerId: string;
  /** Shorter text where space is tight (the dialog still says what is being reported). */
  label?: string;
  className?: string;
}) {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const name = useId();
  if (!me || me.id === ownerId) return null;

  function start() {
    setReason(null);
    setDetails("");
    setFailure(null);
    setDone(null);
    setOpen(true);
  }

  async function send() {
    if (!reason) return setFailure("Escolha um motivo.");
    setBusy(true);
    setFailure(null);
    try {
      await api("/reports", { body: { targetType, targetId, reason, details } });
      setDone(
        "Recebemos sua denúncia. A moderação vai analisar; quem foi denunciado não sabe quem denunciou.",
      );
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "already_reported") setDone(error.message);
      else setFailure(error instanceof ApiFailure ? error.message : "Não foi possível enviar a denúncia.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className={`text-sm text-stone-500 underline-offset-2 hover:text-red-700 hover:underline ${className}`}
      >
        {label ?? `Denunciar ${WHAT[targetType]}`}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Denunciar ${WHAT[targetType]}`}>
        {done ? (
          <>
            <Notice tone="success">{done}</Notice>
            <div className="flex justify-end">
              <Button onClick={() => setOpen(false)}>Fechar</Button>
            </div>
          </>
        ) : (
          <>
            {failure ? <Notice tone="error">{failure}</Notice> : null}
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium text-stone-800">Motivo</legend>
              {REPORT_REASONS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="radio"
                    name={name}
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                    className="size-4 accent-indigo-600"
                  />
                  {REPORT_REASON_LABELS[option]}
                </label>
              ))}
            </fieldset>
            <TextArea
              label="Detalhes (opcional)"
              value={details}
              maxLength={1000}
              onChange={(event) => setDetails(event.target.value)}
              hint="O que aconteceu? Ajuda a moderação a decidir."
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <Button busy={busy} onClick={send}>
                Enviar denúncia
              </Button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}

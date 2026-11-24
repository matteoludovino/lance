"use client";

import { proposalInput, proposalPrice, type ProposalView } from "@lance/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { budget, money } from "@/lib/format";
import { serverFieldErrors, validate, without, type FieldErrors } from "@/lib/forms";
import { MoneyField, moneyText, readMoney } from "./money-field";
import { Button } from "./ui/button";
import { TextArea, TextField } from "./ui/field";
import { Notice } from "./ui/notice";

interface Row {
  key: number;
  title: string;
  amount: string;
}

let nextKey = 0;
const row = (title = "", amount = ""): Row => ({ key: nextKey++, title, amount });

/** Sending (or changing) a proposal: a letter, a deadline and the work split into paid milestones. */
export function ProposalForm({
  projectId,
  budgetMinCents,
  budgetMaxCents,
  proposal,
  onDone,
}: {
  projectId: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  proposal?: ProposalView;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [coverLetter, setCoverLetter] = useState(proposal?.coverLetter ?? "");
  const [days, setDays] = useState(proposal ? String(proposal.deliveryDays) : "");
  const [rows, setRows] = useState<Row[]>(
    proposal ? proposal.milestones.map((m) => row(m.title, moneyText(m.amountCents))) : [row()],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [rowErrors, setRowErrors] = useState<Record<number, { title?: string; amount?: string }>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amounts = rows.map((r) => readMoney(r.amount));
  const total = amounts.every((a) => a !== null)
    ? proposalPrice(amounts.map((a) => ({ amountCents: a! })))
    : null;

  function change(key: number, field: "title" | "amount", value: string) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
    setRowErrors((current) => ({ ...current, [key]: { ...current[key], [field]: undefined } }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const perRow: typeof rowErrors = {};
    rows.forEach((r, index) => {
      const amount = amounts[index];
      const problems: { title?: string; amount?: string } = {};
      if (r.title.trim().length < 3) problems.title = "Dê um nome à etapa (3 letras ou mais).";
      if (amount === null) problems.amount = "Digite um valor, como 1.500.";
      else if (amount < 1_000) problems.amount = "O mínimo por etapa é R$ 10.";
      if (problems.title || problems.amount) perRow[r.key] = problems;
    });
    const input = {
      coverLetter,
      deliveryDays: Number(days) || 0,
      milestones: rows.map((r, index) => ({ title: r.title, amountCents: amounts[index] ?? 0 })),
    };
    const { data, errors } = validate(proposalInput, input);
    const fields: FieldErrors = { ...errors };
    delete fields.milestones;
    if (!/^\d+$/.test(days.trim()) || Number(days) < 1 || Number(days) > 365) {
      fields.deliveryDays = "Um número de dias entre 1 e 365.";
    }
    setErrors(fields);
    setRowErrors(perRow);
    setFailure(null);
    if (!data || Object.keys(perRow).length > 0 || fields.deliveryDays) return;
    setBusy(true);
    try {
      if (proposal) await api(`/proposals/${proposal.id}`, { method: "PUT", body: data });
      else await api(`/projects/${projectId}/proposals`, { body: data });
      onDone?.();
      router.refresh();
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  const outside = total !== null && (total < budgetMinCents || total > budgetMaxCents);

  return (
    <form onSubmit={submit} noValidate className="@container grid gap-5">
      {failure ? <Notice tone="error">{failure}</Notice> : null}
      <TextArea
        label="Carta de apresentação"
        rows={6}
        value={coverLetter}
        onChange={(e) => {
          setCoverLetter(e.target.value);
          setErrors((current) => without(current, "coverLetter"));
        }}
        error={errors.coverLetter}
        hint="Por que você é a pessoa certa, como vai fazer e o que já fez de parecido."
      />
      <TextField
        label="Prazo total (dias)"
        inputMode="numeric"
        value={days}
        onChange={(e) => {
          setDays(e.target.value);
          setErrors((current) => without(current, "deliveryDays"));
        }}
        error={errors.deliveryDays}
        className="max-w-40"
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-stone-800">Etapas e valores</legend>
        <p className="text-sm text-stone-500">
          Cada etapa é paga quando o cliente aprovar a entrega dela. O preço da proposta é a soma das etapas.
        </p>
        <ol className="grid gap-3">
          {rows.map((r, index) => (
            <li
              key={r.key}
              className="grid gap-3 rounded-xl border border-stone-200 p-3 @md:grid-cols-[1fr_9rem_auto] @md:items-start"
            >
              <TextField
                label={`Etapa ${index + 1}`}
                value={r.title}
                onChange={(e) => change(r.key, "title", e.target.value)}
                error={rowErrors[r.key]?.title}
                placeholder="Ex.: Protótipo das telas"
              />
              <MoneyField
                label="Valor (R$)"
                value={r.amount}
                onChange={(e) => change(r.key, "amount", e.target.value)}
                error={rowErrors[r.key]?.amount}
              />
              {rows.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-self-start @md:mt-7"
                  onClick={() => setRows((current) => current.filter((other) => other.key !== r.key))}
                  aria-label={`Remover etapa ${index + 1}`}
                >
                  Remover
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
        {rows.length < 5 ? (
          <Button
            type="button"
            variant="secondary"
            className="justify-self-start"
            onClick={() => setRows((c) => [...c, row()])}
          >
            Adicionar etapa
          </Button>
        ) : null}
      </fieldset>
      <div className="grid gap-1 rounded-xl bg-stone-50 p-4" aria-live="polite">
        <p className="text-sm text-stone-600">Preço total da proposta</p>
        <p className="text-xl font-semibold">{total === null ? "—" : money(total)}</p>
        {outside ? (
          <p className="text-sm text-amber-800">
            Fora do orçamento do cliente ({budget(budgetMinCents, budgetMaxCents)}). Você pode enviar mesmo
            assim.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" busy={busy}>
          {proposal ? "Salvar alterações" : "Enviar proposta"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

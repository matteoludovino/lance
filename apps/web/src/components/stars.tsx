"use client";

import type { Reputation } from "@lance/shared";

/** Five stars, filled up to the rating (read-only). */
export function Stars({ rating, size = "text-base" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`${rating} de 5 estrelas`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} aria-hidden className={n <= Math.round(rating) ? "text-amber-500" : "text-stone-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

/** "★ 4,8 · 12 avaliações", or "Sem avaliações ainda". */
export function ReputationLine({ reputation }: { reputation: Reputation }) {
  if (reputation.count === 0 || reputation.average === null) {
    return <span className="text-stone-500">Sem avaliações ainda</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Stars rating={reputation.average} size="text-sm" />
      <span className="font-medium text-stone-800">{reputation.average.toLocaleString("pt-BR")}</span>
      <span className="text-stone-500">
        · {reputation.count} {reputation.count === 1 ? "avaliação" : "avaliações"}
      </span>
    </span>
  );
}

const LABELS = ["", "Ruim", "Fraco", "Bom", "Muito bom", "Excelente"];

/** Choosing 1–5 stars: a radio group (arrow keys move, the label says what each means). */
export function StarInput({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (n: number) => void;
  error?: string;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium text-stone-800">Nota</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer text-3xl leading-none has-focus-visible:outline-2 has-focus-visible:outline-indigo-600"
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
              aria-label={`${n} — ${LABELS[n]}`}
            />
            <span
              aria-hidden
              className={n <= value ? "text-amber-500" : "text-stone-300 hover:text-amber-300"}
            >
              ★
            </span>
          </label>
        ))}
        <span className="ml-2 text-sm text-stone-600">{value ? LABELS[value] : ""}</span>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </fieldset>
  );
}

import { formatBRL } from "@lance/shared";
import type { ReactNode } from "react";

const months = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

export function memberSince(iso: string): string {
  return `No Lance desde ${months.format(new Date(iso))}`;
}

export function place(city: string | null, state: string | null): string | null {
  return city && state ? `${city}/${state}` : (city ?? state);
}

export function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

/** The top of a public profile: avatar initials, name, and a few facts. */
export function ProfileHeader({
  name,
  title,
  facts,
}: {
  name: string;
  title?: string | null;
  facts: (string | null)[];
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        aria-hidden
        className="grid size-16 shrink-0 place-items-center rounded-full bg-indigo-100 text-xl font-semibold text-indigo-800"
      >
        {initials(name)}
      </div>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
        {title ? <p className="text-stone-800">{title}</p> : null}
        <p className="text-sm text-stone-500">{facts.filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function Budget({ cents }: { cents: number }) {
  return <>Projetos a partir de {formatBRL(cents)}</>;
}

export function ProfileSkeleton() {
  return (
    <div aria-busy className="grid gap-6">
      <div className="flex items-center gap-4">
        <div className="size-16 animate-pulse rounded-full bg-stone-200" />
        <div className="grid gap-2">
          <div className="h-6 w-48 animate-pulse rounded bg-stone-200" />
          <div className="h-4 w-64 animate-pulse rounded bg-stone-200" />
        </div>
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-stone-200/70" />
    </div>
  );
}

export function Unavailable() {
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"
    >
      <p className="font-medium">O servidor está acordando.</p>
      <p className="text-sm">
        No plano gratuito ele dorme quando ninguém usa. Recarregue a página em alguns segundos.
      </p>
    </div>
  );
}

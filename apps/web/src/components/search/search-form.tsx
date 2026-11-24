"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

/**
 * A GET form for a search page. Works as a plain form without JavaScript; with it, picking from a list or
 * ticking a box applies at once, empty fields stay out of the address, and the page changes without a
 * reload. Changing anything starts again from the first page (the cursor isn't a field).
 */
export function SearchForm({ action, children }: { action: string; children: ReactNode }) {
  const router = useRouter();

  function go(form: HTMLFormElement) {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === "string" && value.trim() !== "") params.append(key, value.trim());
    }
    const query = params.toString();
    router.push(query ? `${action}?${query}` : action, { scroll: false });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(event.currentTarget);
  }

  function change(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    if (target instanceof HTMLSelectElement || target.type === "checkbox") go(event.currentTarget);
  }

  return (
    <form action={action} role="search" onSubmit={submit} onChange={change} className="contents">
      {children}
    </form>
  );
}

/** On small screens the filters fold behind a button; from md up they're always shown. */
export function FiltersPanel({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid content-start gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="search-filters"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 shadow-xs md:hidden"
      >
        <span>Filtros{active > 0 ? ` (${active})` : ""}</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      <div
        id="search-filters"
        className={`${open ? "grid" : "hidden"} gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:grid`}
      >
        {children}
      </div>
    </div>
  );
}

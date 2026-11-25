"use client";

import { DEMO_PERSONAS, DEMO_PERSONA_LABELS } from "@lance/shared";
import { useEnterDemo } from "@/lib/demo";
import { Notice } from "./ui/notice";

/** The landing page's one-click demo: pick who to be. */
export function DemoStart() {
  const { enter, busy, failure } = useEnterDemo();
  return (
    <section
      aria-labelledby="demo-title"
      className="grid gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5"
    >
      <div className="grid gap-1">
        <h2 id="demo-title" className="text-lg font-semibold text-stone-900">
          Experimente agora, sem cadastro
        </h2>
        <p className="text-sm text-stone-700">
          Uma demonstração só sua, com um contrato em andamento e freelancers da vitrine respondendo. Nenhum
          e-mail é enviado de verdade, e tudo some em 24 horas.
        </p>
      </div>
      {failure ? <Notice tone="error">{failure}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {DEMO_PERSONAS.map((persona) => (
          <button
            key={persona}
            type="button"
            onClick={() => enter(persona)}
            disabled={busy !== null}
            aria-busy={busy === persona || undefined}
            className="grid gap-1 rounded-xl border border-stone-200 bg-white p-4 text-left shadow-xs transition hover:border-indigo-300 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-70"
          >
            <span className="flex items-center gap-2 font-semibold text-indigo-700">
              {busy === persona ? (
                <span
                  aria-hidden
                  className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
                />
              ) : null}
              Entrar como {DEMO_PERSONA_LABELS[persona].label.toLowerCase()}
            </span>
            <span className="text-sm text-stone-600">{DEMO_PERSONA_LABELS[persona].description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

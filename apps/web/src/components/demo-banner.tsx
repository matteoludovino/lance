"use client";

import { DEMO_PERSONAS, DEMO_PERSONA_LABELS } from "@lance/shared";
import Link from "next/link";
import { personaOf, useEnterDemo } from "@/lib/demo";
import { useMe } from "@/lib/session";

/** For demo visitors: who they are now, the other two personas one click away, and the demo's inbox. */
export function DemoBanner() {
  const { data: me } = useMe();
  const { enter, busy, failure } = useEnterDemo();
  if (!me?.demo) return null;
  const current = personaOf(me);
  return (
    <div className="border-b border-indigo-100 bg-indigo-50 text-sm text-indigo-950">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2">
        <span>
          <strong className="font-semibold">Demonstração</strong> · você é {me.name} (
          {DEMO_PERSONA_LABELS[current].label.toLowerCase()})
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-indigo-800">Trocar para:</span>
          {DEMO_PERSONAS.filter((persona) => persona !== current).map((persona) => (
            <button
              key={persona}
              type="button"
              onClick={() => enter(persona)}
              disabled={busy !== null}
              className="rounded-md border border-indigo-200 bg-white px-2 py-0.5 font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
            >
              {DEMO_PERSONA_LABELS[persona].label}
            </button>
          ))}
        </span>
        <Link href="/demo/emails" className="font-medium text-indigo-700 underline-offset-2 hover:underline">
          E-mails da demo
        </Link>
        {failure ? (
          <span role="alert" className="text-red-700">
            {failure}
          </span>
        ) : null}
      </div>
    </div>
  );
}

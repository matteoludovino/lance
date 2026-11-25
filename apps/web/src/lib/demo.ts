"use client";

import type { DemoPersona, Me } from "@lance/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiFailure } from "./api";
import { setMode } from "./mode";
import { useSetMe } from "./session";

/** Which of the demo's three people this account is. */
export function personaOf(me: Me): DemoPersona {
  if (me.role === "admin") return "admin";
  return me.freelancer && !me.client ? "freelancer" : "client";
}

const HOME: Record<DemoPersona, string> = { client: "/painel", freelancer: "/painel", admin: "/admin" };

/**
 * Starts a demo as a persona, or switches to another inside the current one. Everything cached for the
 * previous person is dropped, and the interface opens on the new person's side.
 */
export function useEnterDemo() {
  const setMe = useSetMe();
  const router = useRouter();
  const [busy, setBusy] = useState<DemoPersona | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function enter(persona: DemoPersona) {
    setBusy(persona);
    setFailure(null);
    try {
      const me = await api<Me>("/demo", { body: { persona } });
      setMe(null); // drops what the previous person's pages had loaded
      setMe(me);
      setMode(persona === "freelancer" ? "freelancer" : "client");
      router.push(HOME[persona]);
    } catch (error) {
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível abrir a demonstração.");
    } finally {
      setBusy(null);
    }
  }

  return { enter, busy, failure };
}

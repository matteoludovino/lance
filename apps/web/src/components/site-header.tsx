"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { setMode, useMode, type Mode } from "@/lib/mode";
import { useMe, useSetMe } from "@/lib/session";
import { Button, ButtonLink } from "./ui/button";

const MODES: { mode: Mode; label: string }[] = [
  { mode: "client", label: "Contratar" },
  { mode: "freelancer", label: "Trabalhar" },
];

export function SiteHeader() {
  const { data: me, isPending } = useMe();
  const mode = useMode();
  const setMe = useSetMe();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setMe(null);
      setLeaving(false);
      router.push("/");
    }
  }

  return (
    <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
        <Link href={me ? "/painel" : "/"} className="text-lg font-semibold tracking-tight">
          Lance
        </Link>
        {me ? (
          <div role="group" aria-label="Modo" className="hidden rounded-lg bg-stone-100 p-0.5 sm:flex">
            {MODES.map((option) => (
              <button
                key={option.mode}
                type="button"
                aria-pressed={mode === option.mode}
                onClick={() => setMode(option.mode)}
                className="rounded-md px-3 py-1 text-sm text-stone-600 aria-pressed:bg-white aria-pressed:font-medium aria-pressed:text-stone-900 aria-pressed:shadow-xs"
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {/* On phones the page links take a row of their own, under the logo and the account buttons. */}
        <nav
          aria-label="Principal"
          className="order-last flex basis-full items-center gap-4 pt-1 pb-1 sm:order-none sm:basis-auto sm:p-0"
        >
          <Link href="/projetos" className="text-sm text-stone-700 hover:text-stone-900">
            Projetos
          </Link>
          <Link href="/freelancers" className="text-sm text-stone-700 hover:text-stone-900">
            Freelancers
          </Link>
          {me ? <MessagesLink /> : null}
        </nav>
        <nav aria-label="Conta" className="ml-auto flex items-center gap-2">
          {isPending ? null : me ? (
            <>
              <Link
                href="/perfil/editar"
                className="hidden text-sm text-stone-700 hover:text-stone-900 sm:block"
              >
                {me.name}
              </Link>
              <Button variant="ghost" onClick={logout} busy={leaving}>
                Sair
              </Button>
            </>
          ) : (
            <>
              <ButtonLink href="/entrar" variant="ghost">
                Entrar
              </ButtonLink>
              <ButtonLink href="/cadastro">Criar conta</ButtonLink>
            </>
          )}
        </nav>
      </div>
      {me ? (
        <div role="group" aria-label="Modo" className="flex border-t border-stone-100 sm:hidden">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              aria-pressed={mode === option.mode}
              onClick={() => setMode(option.mode)}
              className="flex-1 py-2 text-sm text-stone-600 aria-pressed:font-medium aria-pressed:text-indigo-700 aria-pressed:shadow-[inset_0_-2px] aria-pressed:shadow-indigo-600"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </header>
  );
}

/** "Mensagens", with how many are unread (kept current by the live connection). */
function MessagesLink() {
  const { data } = useQuery({
    queryKey: ["me", "unread"],
    queryFn: () => api<{ total: number }>("/me/unread"),
    refetchInterval: 120_000,
  });
  const unread = data?.total ?? 0;
  return (
    <Link href="/mensagens" className="flex items-center gap-1.5 text-sm text-stone-700 hover:text-stone-900">
      Mensagens
      {unread > 0 ? (
        <span className="rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white">
          {unread}
          <span className="sr-only"> não lidas</span>
        </span>
      ) : null}
    </Link>
  );
}

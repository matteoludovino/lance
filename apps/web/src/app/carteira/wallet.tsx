"use client";

import type { WalletView } from "@lance/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { RequireSession } from "@/components/require-session";
import { Notice } from "@/components/ui/notice";
import { api } from "@/lib/api";
import { dateTime, money } from "@/lib/format";

export function Wallet() {
  return <RequireSession>{() => <Balance />}</RequireSession>;
}

function Balance() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["me", "wallet"],
    queryFn: () => api<WalletView>("/me/wallet"),
  });
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Carteira</h1>
      {isPending ? (
        <div aria-busy className="h-40 animate-pulse rounded-2xl bg-stone-200/70" />
      ) : isError || !data ? (
        <Notice tone="error">Não foi possível carregar a carteira. Recarregue a página.</Notice>
      ) : (
        <>
          <div className="grid gap-1 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-stone-500">Saldo recebido (já descontada a taxa)</p>
            <p className="text-3xl font-semibold">{money(data.balanceCents)}</p>
            <p className="text-sm text-stone-500">Pagamento simulado: não há saque nesta demonstração.</p>
          </div>
          <section aria-labelledby="entries" className="grid gap-3">
            <h2 id="entries" className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
              Recebimentos
            </h2>
            {data.entries.length === 0 ? (
              <p className="text-stone-600">Nada recebido ainda: as etapas aprovadas aparecem aqui.</p>
            ) : (
              <ul className="grid divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white px-5 shadow-sm">
                {data.entries.map((entry, index) => (
                  <li key={index} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                    <span>
                      <Link
                        href={`/contratos/${entry.contractId}`}
                        className="font-medium hover:text-indigo-700"
                      >
                        {entry.milestone}
                      </Link>
                      <span className="block text-sm text-stone-500">
                        {entry.project} · {dateTime(entry.at)}
                      </span>
                    </span>
                    <span className="font-semibold text-emerald-800">+ {money(entry.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

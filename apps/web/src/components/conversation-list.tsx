"use client";

import type { ConversationSummary } from "@lance/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import { Notice } from "./ui/notice";

/** The viewer's conversations, most recent first, with unread counts. */
export function ConversationList({ selected }: { selected?: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api<ConversationSummary[]>("/conversations"),
  });
  if (isPending) return <div aria-busy className="h-64 animate-pulse rounded-2xl bg-stone-200/70" />;
  if (isError) return <Notice tone="error">Não foi possível carregar as conversas.</Notice>;
  if (data.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-sm text-stone-600">
        Nenhuma conversa ainda. Elas começam com uma proposta, ou com um convite de um cliente.
      </p>
    );
  }
  return (
    <nav aria-label="Conversas">
      <ul className="grid divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {data.map((conversation) => (
          <li key={conversation.id}>
            <Link
              href={`/mensagens/${conversation.id}`}
              aria-current={conversation.id === selected ? "page" : undefined}
              className="grid gap-0.5 px-4 py-3 hover:bg-stone-50 aria-[current=page]:bg-indigo-50"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate ${conversation.unread > 0 ? "font-semibold" : "font-medium"}`}>
                  {conversation.other.name}
                </span>
                {conversation.unread > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-2 text-xs font-semibold text-white">
                    <span className="sr-only">não lidas: </span>
                    {conversation.unread}
                  </span>
                ) : conversation.lastMessage ? (
                  <span className="shrink-0 text-xs text-stone-500">{ago(conversation.lastMessage.at)}</span>
                ) : null}
              </span>
              <span className="truncate text-xs text-stone-500">{conversation.project.title}</span>
              <span className="truncate text-sm text-stone-600">
                {conversation.lastMessage
                  ? `${conversation.lastMessage.fromMe ? "Você: " : ""}${conversation.lastMessage.body}`
                  : "Sem mensagens ainda"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

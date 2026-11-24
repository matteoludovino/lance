"use client";

import { detectContact, type ConversationView, type MessageView, type SentMessage } from "@lance/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ConversationList } from "@/components/conversation-list";
import { RequireSession } from "@/components/require-session";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { ReportButton } from "@/components/report-button";
import { dateTime } from "@/lib/format";
import { useConnection, useRealtime, useTyping } from "@/lib/realtime";

export function ChatScreen({ id }: { id: string }) {
  return (
    <RequireSession>
      {(me) => (
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[20rem_1fr] md:py-10">
          <div className="hidden md:block">
            <ConversationList selected={id} />
          </div>
          <Chat id={id} meId={me.id} />
        </main>
      )}
    </RequireSession>
  );
}

interface Pending {
  clientId: string;
  body: string;
  failed: boolean;
}

const WARNING =
  "Antes de fechar contrato, combine tudo por aqui: fora do Lance não há custódia do pagamento nem disputa se algo der errado.";

function Chat({ id, meId }: { id: string; meId: string }) {
  const queries = useQueryClient();
  const realtime = useRealtime();
  const connection = useConnection();
  const typing = useTyping(id);
  const key = ["conversation", id];
  const {
    data: conversation,
    error,
    isPending,
  } = useQuery({
    queryKey: key,
    queryFn: () => api<ConversationView>(`/conversations/${id}`),
    retry: (count, failure) => !(failure instanceof ApiFailure && failure.status < 500) && count < 3,
  });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [warning, setWarning] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastTyping = useRef(0);

  // Sent messages the server has confirmed leave the pending list.
  const confirmed = new Set(conversation?.messages.map((m) => m.clientId));
  const waiting = pending.filter((p) => !confirmed.has(p.clientId));

  // Read what is on screen, while the tab is visible.
  const lastSeq = conversation?.lastSeq ?? 0;
  const myReadSeq = conversation?.myReadSeq ?? 0;
  useEffect(() => {
    if (lastSeq <= myReadSeq) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      void api(`/conversations/${id}/read`, { method: "POST", body: { seq: lastSeq } }).then(() => {
        void queries.invalidateQueries({ queryKey: ["me", "unread"] });
        void queries.invalidateQueries({ queryKey: ["conversations"] });
      });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [id, lastSeq, myReadSeq, queries]);

  // Keep the newest message in view, unless the person scrolled up to read older ones.
  const count = (conversation?.messages.length ?? 0) + waiting.length;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [count, typing]);

  const send = useCallback(
    async (item: Pending) => {
      setPending((current) => [
        ...current.filter((p) => p.clientId !== item.clientId),
        { ...item, failed: false },
      ]);
      try {
        const sent = await api<SentMessage>(`/conversations/${id}/messages`, {
          body: { clientId: item.clientId, body: item.body },
        });
        if (sent.warning) setWarning(true);
        queries.setQueryData<ConversationView>(key, (current) =>
          !current || current.messages.some((m) => m.seq === sent.message.seq)
            ? current
            : {
                ...current,
                messages: [...current.messages, sent.message].sort((a, b) => a.seq - b.seq),
                lastSeq: Math.max(current.lastSeq, sent.message.seq),
                myReadSeq: Math.max(current.myReadSeq, sent.message.seq),
              },
        );
        setPending((current) => current.filter((p) => p.clientId !== item.clientId));
      } catch {
        // Kept with its id: "try again" resends it, and the server never stores it twice.
        setPending((current) =>
          current.map((p) => (p.clientId === item.clientId ? { ...p, failed: true } : p)),
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, queries],
  );

  function submit() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    stick.current = true;
    void send({ clientId: crypto.randomUUID(), body, failed: false });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function onType(value: string) {
    setDraft(value);
    const now = Date.now();
    if (value && now - lastTyping.current > 2000) {
      lastTyping.current = now;
      realtime.sendTyping(id);
    }
  }

  async function loadOlder() {
    const first = conversation?.messages[0];
    if (!first) return;
    setLoadingOlder(true);
    const element = scroller.current;
    const fromBottom = element ? element.scrollHeight - element.scrollTop : 0;
    try {
      const older = await api<ConversationView>(`/conversations/${id}?before=${first.seq}`);
      stick.current = false;
      queries.setQueryData<ConversationView>(key, (current) =>
        current
          ? {
              ...current,
              hasOlder: older.hasOlder,
              messages: [...older.messages, ...current.messages.filter((m) => m.seq >= first.seq)],
            }
          : current,
      );
      requestAnimationFrame(() => {
        if (element) element.scrollTop = element.scrollHeight - fromBottom;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  if (isPending) return <div aria-busy className="h-96 animate-pulse rounded-2xl bg-stone-200/70" />;
  if (error || !conversation) {
    return (
      <Notice tone="error">
        {error instanceof ApiFailure && error.status === 404
          ? "Conversa não encontrada."
          : "Não foi possível carregar a conversa. Recarregue a página."}
      </Notice>
    );
  }

  const lastMine = [...conversation.messages].reverse().find((m) => m.senderId === meId);
  const liveWarning = !conversation.contractId && detectContact(draft).length > 0;

  return (
    <section
      aria-label={`Conversa com ${conversation.other.name}`}
      className="flex h-[calc(100dvh-10rem)] min-h-[28rem] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
        <div className="grid">
          <h1 className="font-semibold">{conversation.other.name}</h1>
          <Link
            href={`/projetos/${conversation.project.id}`}
            className="truncate text-sm text-stone-500 hover:underline"
          >
            {conversation.project.title}
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {conversation.contractId ? (
            <Link
              href={`/contratos/${conversation.contractId}`}
              className="font-medium text-indigo-700 hover:underline"
            >
              Ver contrato
            </Link>
          ) : null}
          <span className="flex items-center gap-1.5 text-stone-500" role="status">
            <span
              aria-hidden
              className={`size-2 rounded-full ${connection === "live" ? "bg-emerald-500" : connection === "connecting" ? "animate-pulse bg-amber-500" : "bg-stone-400"}`}
            />
            {connection === "live"
              ? "Ao vivo"
              : connection === "connecting"
                ? "Conectando…"
                : "Reconectando…"}
          </span>
        </div>
      </header>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {conversation.hasOlder ? (
          <div className="mb-4 text-center">
            <Button variant="ghost" busy={loadingOlder} onClick={loadOlder}>
              Mensagens anteriores
            </Button>
          </div>
        ) : null}
        {conversation.messages.length === 0 && waiting.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">
            Nenhuma mensagem ainda. Tire dúvidas, combine detalhes: tudo fica registrado aqui.
          </p>
        ) : null}
        <ol className="grid gap-1.5" aria-label="Mensagens">
          {conversation.messages.map((message, index) => (
            <Bubble
              key={message.id}
              message={message}
              mine={message.senderId === meId}
              firstOfGroup={conversation.messages[index - 1]?.senderId !== message.senderId}
              receipt={
                message.id === lastMine?.id && waiting.length === 0
                  ? conversation.otherReadSeq >= message.seq
                    ? "Lida"
                    : "Enviada"
                  : null
              }
            />
          ))}
          {waiting.map((item) => (
            <li key={item.clientId} className="flex flex-col items-end gap-0.5">
              <p className="max-w-[80%] rounded-2xl bg-indigo-600/70 px-3 py-2 whitespace-pre-wrap text-white">
                {item.body}
              </p>
              {item.failed ? (
                <button
                  type="button"
                  onClick={() => send(item)}
                  className="text-xs font-medium text-red-700 hover:underline"
                >
                  Não enviada. Tentar de novo
                </button>
              ) : (
                <span className="text-xs text-stone-500">Enviando…</span>
              )}
            </li>
          ))}
        </ol>
        {typing ? (
          <p className="mt-2 text-sm text-stone-500" aria-live="polite">
            {conversation.other.name.split(" ")[0]} está digitando…
          </p>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="grid gap-2 border-t border-stone-100 p-3"
      >
        {liveWarning || warning ? <Notice tone="info">{WARNING}</Notice> : null}
        <div className="flex items-end gap-2">
          <label htmlFor="composer" className="sr-only">
            Mensagem
          </label>
          <textarea
            id="composer"
            rows={1}
            value={draft}
            onChange={(event) => onType(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder="Escreva uma mensagem"
            className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-3 focus:ring-indigo-500/20"
          />
          <Button type="submit" disabled={!draft.trim()}>
            Enviar
          </Button>
        </div>
        <p className="text-xs text-stone-500">Enter envia; Shift+Enter quebra a linha.</p>
      </form>
    </section>
  );
}

function Bubble({
  message,
  mine,
  firstOfGroup,
  receipt,
}: {
  message: MessageView;
  mine: boolean;
  firstOfGroup: boolean;
  receipt: string | null;
}) {
  return (
    <li
      className={`group flex flex-col gap-0.5 ${mine ? "items-end" : "items-start"} ${firstOfGroup ? "mt-2" : ""}`}
    >
      <p
        className={`max-w-[80%] rounded-2xl px-3 py-2 whitespace-pre-wrap break-words ${mine ? "bg-indigo-600 text-white" : "bg-stone-100 text-stone-900"}`}
        title={dateTime(message.createdAt)}
      >
        {message.body}
      </p>
      {receipt ? <span className="text-xs text-stone-500">{receipt}</span> : null}
      {mine ? null : (
        // Always there on touch screens; on wider ones, on hover or keyboard focus.
        <ReportButton
          targetType="message"
          targetId={message.id}
          ownerId={message.senderId}
          label="Denunciar"
          className="text-xs sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        />
      )}
    </li>
  );
}

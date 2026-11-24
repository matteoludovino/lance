"use client";

import type { ConversationView, ServerEvent } from "@lance/shared";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { api } from "./api";
import { useMe } from "./session";

type Status = "connecting" | "live" | "offline";

/** Who is typing where: conversation → until when (ms). */
class TypingStore {
  private until = new Map<string, number>();
  private listeners = new Set<() => void>();
  private snapshot = new Map<string, number>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get = () => this.snapshot;

  mark(conversationId: string, ms = 4000) {
    this.until.set(conversationId, Date.now() + ms);
    this.emit();
    setTimeout(() => this.emit(), ms + 50);
  }

  clear(conversationId: string) {
    this.until.delete(conversationId);
    this.emit();
  }

  private emit() {
    const now = Date.now();
    for (const [id, until] of this.until) if (until <= now) this.until.delete(id);
    this.snapshot = new Map(this.until);
    for (const listener of this.listeners) listener();
  }
}

/** The tab's live connection: its status, who is typing, and a way to say "I'm typing". */
class Realtime {
  status: Status = "offline";
  socket: WebSocket | null = null;
  readonly typing = new TypingStore();
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = () => this.status;

  setStatus(status: Status) {
    this.status = status;
    for (const listener of this.listeners) listener();
  }

  sendTyping = (conversationId: string) => {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "typing", conversationId }));
    }
  };
}

/** One per tab (the module lives once per page load). */
const realtime = new Realtime();
const Context = createContext<Realtime>(realtime);

/**
 * One WebSocket per tab while signed in. It trades the session for a one-time ticket, connects, and
 * reconnects with backoff when dropped; on every (re)connection it refetches what may have changed
 * meanwhile. Events update the cached conversations, the list and the unread count in place.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const queries = useQueryClient();
  const userId = me?.id;

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      if (stopped) return;
      realtime.setStatus("connecting");
      try {
        const { ticket, url } = await api<{ ticket: string; url: string }>("/realtime/ticket", {
          method: "POST",
        });
        if (stopped) return;
        const socket = new WebSocket(`${url}?ticket=${encodeURIComponent(ticket)}`);
        realtime.socket = socket;
        socket.onopen = () => {
          attempt = 0;
          realtime.setStatus("live");
          // Anything that happened while disconnected: fetch again.
          void queries.invalidateQueries({ queryKey: ["conversation"] });
          void queries.invalidateQueries({ queryKey: ["conversations"] });
          void queries.invalidateQueries({ queryKey: ["me", "unread"] });
        };
        socket.onmessage = (message) =>
          apply(queries, realtime.typing, userId!, JSON.parse(message.data) as ServerEvent);
        socket.onclose = (event) => {
          if (realtime.socket === socket) realtime.socket = null;
          realtime.setStatus("offline");
          if (stopped) return;
          // Signed out elsewhere: the session is gone, so is the socket.
          if (event.code === 4001) return void queries.invalidateQueries({ queryKey: ["me"] });
          retry(event.code === 4008 ? 60_000 : undefined);
        };
      } catch {
        realtime.setStatus("offline");
        retry();
      }
    }

    function retry(atLeast?: number) {
      if (stopped) return;
      attempt += 1;
      const backoff = Math.min(30_000, 1000 * 2 ** (attempt - 1));
      timer = setTimeout(connect, Math.max(atLeast ?? 0, backoff) * (0.8 + Math.random() * 0.4));
    }

    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      realtime.socket?.close(1000, "bye");
      realtime.socket = null;
    };
  }, [userId, queries]);

  return <Context.Provider value={realtime}>{children}</Context.Provider>;
}

function apply(queries: QueryClient, typing: TypingStore, me: string, event: ServerEvent) {
  const key = ["conversation", event.conversationId];
  if (event.type === "typing") return typing.mark(event.conversationId);
  if (event.type === "message") {
    if (event.message.senderId !== me) typing.clear(event.conversationId);
    queries.setQueryData<ConversationView>(key, (current) => {
      if (!current || current.messages.some((m) => m.seq === event.message.seq)) return current;
      const mine = event.message.senderId === me;
      return {
        ...current,
        messages: [...current.messages, event.message].sort((a, b) => a.seq - b.seq),
        lastSeq: Math.max(current.lastSeq, event.message.seq),
        myReadSeq: mine ? Math.max(current.myReadSeq, event.message.seq) : current.myReadSeq,
      };
    });
  }
  if (event.type === "read") {
    queries.setQueryData<ConversationView>(key, (current) =>
      !current
        ? current
        : event.userId === me
          ? { ...current, myReadSeq: Math.max(current.myReadSeq, event.seq) }
          : { ...current, otherReadSeq: Math.max(current.otherReadSeq, event.seq) },
    );
  }
  void queries.invalidateQueries({ queryKey: ["conversations"] });
  void queries.invalidateQueries({ queryKey: ["me", "unread"] });
}

export function useRealtime(): Realtime {
  return useContext(Context);
}

export function useConnection(): Status {
  const realtime = useRealtime();
  return useSyncExternalStore(realtime.subscribe, realtime.getStatus, () => "offline");
}

const NOBODY = new Map<string, number>();

export function useTyping(conversationId: string): boolean {
  const { typing } = useRealtime();
  return useSyncExternalStore(typing.subscribe, typing.get, () => NOBODY).has(conversationId);
}

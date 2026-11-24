"use client";

import { ConversationList } from "@/components/conversation-list";
import { RequireSession } from "@/components/require-session";

export function Inbox() {
  return (
    <RequireSession>
      {() => (
        <main className="mx-auto grid max-w-5xl gap-6 px-4 py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Mensagens</h1>
          <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
            <ConversationList />
            <p className="hidden self-center text-center text-stone-500 md:block">Escolha uma conversa.</p>
          </div>
        </main>
      )}
    </RequireSession>
  );
}

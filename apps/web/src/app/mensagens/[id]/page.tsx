import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatScreen } from "./chat-screen";

export const metadata: Metadata = { title: "Mensagens" };

export default function ConversationPage({ params }: PageProps<"/mensagens/[id]">) {
  return (
    <Suspense fallback={null}>
      <Conversation params={params} />
    </Suspense>
  );
}

async function Conversation({ params }: { params: PageProps<"/mensagens/[id]">["params"] }) {
  const { id } = await params;
  return <ChatScreen id={id} />;
}

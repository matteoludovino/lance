import type { Metadata } from "next";
import { Inbox } from "./inbox";

export const metadata: Metadata = { title: "Mensagens" };

export default function MessagesPage() {
  return <Inbox />;
}

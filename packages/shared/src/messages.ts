import { z } from "zod";
import type { Person } from "./projects";

export const messageInput = z.object({
  /** Made by the browser: resending with the same id returns the first message (no duplicates). */
  clientId: z.uuid(),
  body: z.string().trim().min(1).max(4000),
});
export type MessageInput = z.input<typeof messageInput>;

export const readInput = z.object({ seq: z.number().int().nonnegative() });
export const inviteInput = z.object({ freelancerId: z.uuid() });

export type ContactKind = "phone" | "email" | "outside_channel";

/**
 * Contact details in a message, for the warning before a contract exists (moving off the platform is how
 * people get scammed: no escrow, no dispute). Tuned on Brazilian text so prices (R$ 1.500,00), CEPs
 * (01310-100), dates (24/11/2026) and times (14:30) don't trip it.
 */
export function detectContact(text: string): ContactKind[] {
  const found = new Set<ContactKind>();
  const lower = text.toLowerCase();
  if (/[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/i.test(text)) found.add("email");
  // An area code (11–99, optionally +55 and in parentheses) followed by 8 or 9 digits, grouped 4-4 or 5-4.
  const phone = /(?:\+?55[\s.-]?\(?[1-9]{2}\)?|\(\s?[1-9]{2}\s?\)|\b[1-9]{2})[\s.-]?9?\s?\d{4}[\s.-]?\d{4}\b/;
  // Or a mobile number written without the area code: 9 digits starting with 9, grouped 5-4 or not.
  const mobile = /\b9\d{4}[\s.-]?\d{4}\b/;
  const withoutMoney = text.replace(/R\$\s?[\d.,]+/g, " ");
  if (phone.test(withoutMoney) || mobile.test(withoutMoney)) found.add("phone");
  if (
    /\b(whats\s?app|whats|wpp|zap|zapzap|telegram|insta(gram)?|skype|signal|discord)\b/.test(lower) ||
    /\b(wa\.me|t\.me|chat\.whatsapp\.com)\b/.test(lower) ||
    /(me chama|me liga|meu n[uú]mero|meu contato|fala comigo) (no|na|pelo|pela|em)?\s?/.test(lower) ||
    /(^|\s)@[a-z0-9_.]{3,}/.test(lower)
  ) {
    found.add("outside_channel");
  }
  return [...found];
}

export interface MessageView {
  id: string;
  conversationId: string;
  seq: number;
  senderId: string;
  clientId: string;
  body: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  project: { id: string; title: string };
  /** The other person. */
  other: Person;
  role: "client" | "freelancer";
  lastMessage: { body: string; fromMe: boolean; at: string } | null;
  unread: number;
}

export interface ConversationView extends ConversationSummary {
  lastSeq: number;
  myReadSeq: number;
  /** The other side's read position: my messages up to here were read. */
  otherReadSeq: number;
  /** A contract exists between the two for this project (contact details are no longer warned about). */
  contractId: string | null;
  messages: MessageView[];
  /** Older messages exist before the first one returned. */
  hasOlder: boolean;
}

export interface SentMessage {
  message: MessageView;
  /** Contact details were spotted before a contract: tell the sender why to stay on the platform. */
  warning: ContactKind[] | null;
}

/** What the WebSocket pushes (it never receives writes, except "typing"). */
export type ServerEvent =
  | { type: "message"; conversationId: string; message: MessageView }
  | { type: "read"; conversationId: string; userId: string; seq: number }
  | { type: "typing"; conversationId: string; userId: string };

export type ClientEvent = { type: "typing"; conversationId: string };

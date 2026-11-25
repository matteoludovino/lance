# 5. Real time, with writes over REST

**Status:** accepted

## Context

Client and freelancer chat live: delivery without reloading, "typing…", unread counts and read receipts.
Messages must never be lost, duplicated or reordered, including across reconnections.

## Decision

- Sending is a REST call with an id minted by the browser: `(senderId, clientMessageId)` is unique, so a
  retry returns the first message.
- Each conversation numbers its messages 1, 2, 3… by `UPDATE conversations SET lastSeq = lastSeq + 1
RETURNING`: the row lock orders senders and a rolled-back send leaves no gap. Unread is
  `lastSeq − readSeq`; a receipt is the other side's `readSeq`.
- The WebSocket only pushes (messages after commit, receipts, "typing"). It opens with a one-time ticket
  from the same-origin API (the socket goes straight to the API's host in production), checks the Origin,
  allows five sockets per person, pings every 30 s, and is closed by logout or a password reset.
- Every (re)connection refetches what may have been missed.

## Consequences

- The socket can drop at any time without losing anything; REST is the source of truth.
- Contact details before a contract are detected on send: the sender is warned and moderation gets an
  automatic report, but the message is delivered.

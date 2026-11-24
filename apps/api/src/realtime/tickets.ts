import { Injectable } from "@nestjs/common";
import { newToken } from "../common/secrets.ts";
import { Clock } from "../time/clock.ts";

export interface Grant {
  userId: string;
  sessionId: string;
}

const TTL_MS = 60_000;

/**
 * One-time passes to open the WebSocket. In production the browser connects straight to the API's host
 * (the web app's host doesn't proxy WebSockets), where the session cookie, which belongs to the web
 * app's origin, isn't sent: it trades it for a ticket over the same-origin REST API first. Tickets live a
 * minute, in memory, and work once, so a leaked handshake URL is useless.
 */
@Injectable()
export class Tickets {
  private readonly grants = new Map<string, Grant & { expires: number }>();

  constructor(private readonly clock: Clock) {}

  issue(grant: Grant): string {
    const now = this.clock.now().getTime();
    for (const [ticket, held] of this.grants) if (held.expires < now) this.grants.delete(ticket);
    const ticket = newToken();
    this.grants.set(ticket, { ...grant, expires: now + TTL_MS });
    return ticket;
  }

  redeem(ticket: string | null): Grant | null {
    if (!ticket) return null;
    const grant = this.grants.get(ticket);
    this.grants.delete(ticket);
    if (!grant || grant.expires < this.clock.now().getTime()) return null;
    return { userId: grant.userId, sessionId: grant.sessionId };
  }
}

import { Injectable } from "@nestjs/common";
import type { ServerEvent } from "@lance/shared";

/** What the hub needs from a socket (the ws library's WebSocket, or a fake in tests). */
export interface Peer {
  send(data: string): void;
  close(code: number, reason: string): void;
  readonly bufferedAmount: number;
}

interface Connection {
  peer: Peer;
  userId: string;
  sessionId: string;
}

export const MAX_SOCKETS_PER_USER = 5;
/** A peer this far behind is too slow to keep: drop it (it reconnects and catches up over REST). */
const MAX_BUFFERED = 1024 * 1024;

export const CLOSE = {
  tooMany: 4008,
  signedOut: 4001,
  slow: 4002,
} as const;

/**
 * Who is connected, by user. Writes never come through here: the REST API commits, then publishes to
 * the people concerned. One API instance, so this is all in memory.
 */
@Injectable()
export class Hub {
  private readonly byUser = new Map<string, Set<Connection>>();

  /** Registers a socket; false if the user already has the maximum open (the new one is refused). */
  add(peer: Peer, userId: string, sessionId: string): Connection | null {
    const connections = this.byUser.get(userId) ?? new Set<Connection>();
    if (connections.size >= MAX_SOCKETS_PER_USER) return null;
    const connection = { peer, userId, sessionId };
    connections.add(connection);
    this.byUser.set(userId, connections);
    return connection;
  }

  remove(connection: Connection): void {
    const connections = this.byUser.get(connection.userId);
    connections?.delete(connection);
    if (connections?.size === 0) this.byUser.delete(connection.userId);
  }

  publish(userIds: string[], event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const userId of new Set(userIds)) {
      for (const connection of this.byUser.get(userId) ?? []) {
        if (connection.peer.bufferedAmount > MAX_BUFFERED) {
          connection.peer.close(CLOSE.slow, "too slow");
          continue;
        }
        connection.peer.send(data);
      }
    }
  }

  /** Signing out of one browser closes that session's sockets. */
  closeSession(sessionId: string): void {
    for (const connections of this.byUser.values()) {
      for (const connection of connections) {
        if (connection.sessionId === sessionId) connection.peer.close(CLOSE.signedOut, "signed out");
      }
    }
  }

  /** A password reset or a suspension closes every socket of the user. */
  closeUser(userId: string): void {
    for (const connection of this.byUser.get(userId) ?? [])
      connection.peer.close(CLOSE.signedOut, "signed out");
  }

  count(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0;
  }
}

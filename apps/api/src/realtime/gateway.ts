import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { ENV, type Env } from "../env.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { CLOSE, Hub } from "./hub.ts";
import { Tickets } from "./tickets.ts";

const clientEvent = z.object({ type: z.literal("typing"), conversationId: z.uuid() });
const TYPING_EVERY_MS = 1500;

/**
 * The WebSocket endpoint (/ws?ticket=…). It only pushes: messages and read receipts are written over
 * REST and published after commit. The one thing it accepts is "typing", relayed to the other person of
 * a conversation the socket's user belongs to. Every handshake must come from the web app's origin and
 * carry a fresh one-time ticket; idle sockets are pinged, and dropped after a missed pong.
 */
@Injectable()
export class Gateway implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Gateway");
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  private heartbeat: NodeJS.Timeout | undefined;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly hub: Hub,
    private readonly tickets: Tickets,
    private readonly db: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter.getHttpServer() as import("node:http").Server;
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) =>
      this.upgrade(request, socket, head),
    );
    const alive = new WeakSet<WebSocket>();
    this.wss.on("connection", (ws) => {
      alive.add(ws);
      ws.on("pong", () => alive.add(ws));
    });
    this.heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (!alive.has(ws)) {
          ws.terminate();
          continue;
        }
        alive.delete(ws);
        ws.ping();
      }
    }, this.env.WS_HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    for (const ws of this.wss.clients) ws.close(1012, "restarting");
    this.wss.close();
  }

  private upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") return void socket.destroy();
    const refuse = (status: number, reason: string) => {
      socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (!this.env.WEB_ORIGINS.includes(request.headers.origin ?? "")) return refuse(403, "Forbidden");
    const grant = this.tickets.redeem(url.searchParams.get("ticket"));
    if (!grant) return refuse(401, "Unauthorized");

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss.emit("connection", ws, request);
      const connection = this.hub.add(ws, grant.userId, grant.sessionId);
      if (!connection) return ws.close(CLOSE.tooMany, "too many connections");
      const member = new Map<string, string>(); // conversation → the other person
      const lastTyping = new Map<string, number>();
      ws.on("message", async (raw) => {
        try {
          const event = clientEvent.parse(JSON.parse(raw.toString()));
          const now = Date.now();
          if (now - (lastTyping.get(event.conversationId) ?? 0) < TYPING_EVERY_MS) return;
          lastTyping.set(event.conversationId, now);
          let other = member.get(event.conversationId);
          if (!other) {
            const conversation = await this.db.conversation.findFirst({
              where: {
                id: event.conversationId,
                OR: [{ clientId: grant.userId }, { freelancerId: grant.userId }],
              },
            });
            if (!conversation) return;
            other =
              conversation.clientId === grant.userId ? conversation.freelancerId : conversation.clientId;
            member.set(event.conversationId, other);
          }
          this.hub.publish([other], {
            type: "typing",
            conversationId: event.conversationId,
            userId: grant.userId,
          });
        } catch {
          // Anything else from a client is ignored: the socket isn't a way to write.
        }
      });
      ws.on("close", () => this.hub.remove(connection));
      ws.on("error", (error) => this.logger.warn(`socket error: ${error.message}`));
    });
  }
}

import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import { aiAlertRealtimeService } from './ai-alert-realtime.service.js';

// The client must send this protocol plus a short-lived ticket during connection.
const PROTOCOL = 'securaai-alerts.v1';
const TICKET_PREFIX = 'ticket.';
// Check for alert changes every two seconds while clients are connected.
const CHECK_INTERVAL_MS = 2_000;

type RealtimeServer = {
  close: () => void;
};

function rejectUpgrade(socket: Duplex, status: 401 | 403 | 404): void {
  // A failed WebSocket upgrade needs a plain HTTP response before closing the socket.
  const reason = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Not Found';
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function requestedProtocols(value: string | string[] | undefined): string[] {
  // Browsers send all requested WebSocket protocols in one comma-separated header.
  const header = Array.isArray(value) ? value.join(',') : (value ?? '');
  return header
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function alertVersion(): Promise<string> {
  // Build a small fingerprint instead of loading every alert on each check.
  const [count, latest] = await Promise.all([
    prisma.anomaly_alerts.count(),
    prisma.anomaly_alerts.findFirst({
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      select: { id: true, updated_at: true, created_at: true, status: true },
    }),
  ]);
  return latest
    ? `${count}:${latest.id}:${latest.status}:${latest.updated_at.toISOString()}:${latest.created_at.toISOString()}`
    : `${count}:empty`;
}

export function attachAiAlertRealtimeServer(server: Server): RealtimeServer {
  // Share the HTTP server and accept upgrades only after custom security checks.
  const websocketServer = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has(PROTOCOL) ? PROTOCOL : false),
  });
  let lastVersion: string | null = null;
  let checking = false;

  const broadcastUpdate = async (): Promise<void> => {
    // Skip empty or overlapping checks to avoid unnecessary database requests.
    if (checking || websocketServer.clients.size === 0) return;
    checking = true;
    try {
      const version = await alertVersion();
      // Notify clients only after the first check and only when alert data changed.
      if (lastVersion !== null && version !== lastVersion) {
        const message = JSON.stringify({
          type: 'ai-alerts.updated',
          occurredAt: new Date().toISOString(),
        });
        for (const client of websocketServer.clients) {
          if (client.readyState === WebSocket.OPEN) client.send(message);
        }
      }
      lastVersion = version;
    } catch (error: unknown) {
      logger.warn({ err: error }, 'AI alert realtime version check failed');
    } finally {
      checking = false;
    }
  };

  // The timer must not keep Node.js running during application shutdown.
  const interval = setInterval(() => void broadcastUpdate(), CHECK_INTERVAL_MS);
  interval.unref();

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    // This WebSocket server handles only the AI alert realtime endpoint.
    if (url.pathname !== `${env.API_PREFIX}/ai-alerts/realtime`) {
      rejectUpgrade(socket, 404);
      return;
    }

    const origin = request.headers.origin;
    // Apply the same origin allow-list used by the HTTP API.
    if (!origin || !env.corsOrigins.includes(origin)) {
      rejectUpgrade(socket, 403);
      return;
    }

    const protocols = requestedProtocols(request.headers['sec-websocket-protocol']);
    const ticketProtocol = protocols.find((item) => item.startsWith(TICKET_PREFIX));
    const ticket = ticketProtocol?.slice(TICKET_PREFIX.length);
    // Require the supported protocol and a valid short-lived connection ticket.
    if (!protocols.includes(PROTOCOL) || !ticket || !aiAlertRealtimeService.verifyTicket(ticket)) {
      rejectUpgrade(socket, 401);
      return;
    }

    // All checks passed, so WebSocket may take control of the HTTP connection.
    websocketServer.handleUpgrade(request, socket, head, (client) => {
      websocketServer.emit('connection', client, request);
    });
  });

  websocketServer.on('connection', (client) => {
    // Confirm that the realtime channel is ready before update messages begin.
    client.send(
      JSON.stringify({ type: 'ai-alerts.connected', occurredAt: new Date().toISOString() }),
    );
  });

  return {
    close: () => {
      // Stop polling and close every client when the application shuts down.
      clearInterval(interval);
      for (const client of websocketServer.clients) client.close(1001, 'Server shutting down');
      websocketServer.close();
    },
  };
}

import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import { aiAlertRealtimeService } from './ai-alert-realtime.service.js';

const PROTOCOL = 'securaai-alerts.v1';
const TICKET_PREFIX = 'ticket.';
const CHECK_INTERVAL_MS = 2_000;

type RealtimeServer = {
  close: () => void;
};

function rejectUpgrade(socket: Duplex, status: 401 | 403 | 404): void {
  const reason = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Not Found';
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function requestedProtocols(value: string | string[] | undefined): string[] {
  const header = Array.isArray(value) ? value.join(',') : (value ?? '');
  return header
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function alertVersion(): Promise<string> {
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
  const websocketServer = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => (protocols.has(PROTOCOL) ? PROTOCOL : false),
  });
  let lastVersion: string | null = null;
  let checking = false;

  const broadcastUpdate = async (): Promise<void> => {
    if (checking || websocketServer.clients.size === 0) return;
    checking = true;
    try {
      const version = await alertVersion();
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

  const interval = setInterval(() => void broadcastUpdate(), CHECK_INTERVAL_MS);
  interval.unref();

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== `${env.API_PREFIX}/ai-alerts/realtime`) {
      rejectUpgrade(socket, 404);
      return;
    }

    const origin = request.headers.origin;
    if (!origin || !env.corsOrigins.includes(origin)) {
      rejectUpgrade(socket, 403);
      return;
    }

    const protocols = requestedProtocols(request.headers['sec-websocket-protocol']);
    const ticketProtocol = protocols.find((item) => item.startsWith(TICKET_PREFIX));
    const ticket = ticketProtocol?.slice(TICKET_PREFIX.length);
    if (!protocols.includes(PROTOCOL) || !ticket || !aiAlertRealtimeService.verifyTicket(ticket)) {
      rejectUpgrade(socket, 401);
      return;
    }

    websocketServer.handleUpgrade(request, socket, head, (client) => {
      websocketServer.emit('connection', client, request);
    });
  });

  websocketServer.on('connection', (client) => {
    client.send(
      JSON.stringify({ type: 'ai-alerts.connected', occurredAt: new Date().toISOString() }),
    );
  });

  return {
    close: () => {
      clearInterval(interval);
      for (const client of websocketServer.clients) client.close(1001, 'Server shutting down');
      websocketServer.close();
    },
  };
}

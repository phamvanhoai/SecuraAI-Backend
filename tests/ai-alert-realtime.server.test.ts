import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    anomaly_alerts: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alert-realtime.service.js', () => ({
  aiAlertRealtimeService: { verifyTicket: vi.fn().mockReturnValue('user-id') },
}));

import { attachAiAlertRealtimeServer } from '../src/modules/ai-anomaly-detection-alerts/ai-alert-realtime.server.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe('AI alert realtime WebSocket server', () => {
  it('accepts an allowed origin and scoped ticket protocol', async () => {
    const server = createServer();
    servers.push(server);
    const realtime = attachAiAlertRealtimeServer(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');

    const message = await new Promise<string>((resolve, reject) => {
      const client = new WebSocket(
        `ws://127.0.0.1:${address.port}/api/v1/ai-alerts/realtime`,
        ['securaai-alerts.v1', 'ticket.valid-ticket'],
        { origin: 'http://localhost:3001' },
      );
      client.once('message', (data) => {
        if (Array.isArray(data)) resolve(Buffer.concat(data).toString('utf8'));
        else if (data instanceof ArrayBuffer) resolve(Buffer.from(data).toString('utf8'));
        else resolve(data.toString('utf8'));
        client.close();
      });
      client.once('error', reject);
    });

    expect(JSON.parse(message)).toMatchObject({ type: 'ai-alerts.connected' });
    realtime.close();
  });
});

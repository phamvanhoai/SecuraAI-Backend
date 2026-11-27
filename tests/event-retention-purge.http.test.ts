import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    users: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../src/modules/event-ingestion/event-retention-purge.service.js', () => ({
  eventRetentionPurgeService: {
    getStatus: vi.fn(),
    runManual: vi.fn(),
  },
}));

vi.mock('../src/modules/event-ingestion/event-retention-purge.worker.js', () => ({
  isAutomatedRetentionPurgeWorkerActive: vi.fn(() => true),
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { prisma } from '../src/database/prisma.js';
import { AppError } from '../src/common/errors/app-error.js';
import { eventRetentionPurgeService } from '../src/modules/event-ingestion/event-retention-purge.service.js';

const adminUserId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const app = createApp();

const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: adminUserId,
  expiresIn: '15m',
});

describe('Event Retention Purge HTTP endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.users.findUnique).mockResolvedValue({
      role: 'ADMIN',
      status: 'ACTIVE',
    } as never);
  });

  describe('GET /api/v1/event-governance/retention-purge/status', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/event-governance/retention-purge/status');
      expect(res.status).toBe(401);
    });

    it('rejects non-ADMIN role with 403', async () => {
      vi.mocked(prisma.users.findUnique).mockResolvedValue({
        role: 'SECURITY_OFFICER',
        status: 'ACTIVE',
      } as never);

      const res = await request(app)
        .get('/api/v1/event-governance/retention-purge/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('returns retention purge status and recent runs for ADMIN', async () => {
      vi.mocked(eventRetentionPurgeService.getStatus).mockResolvedValue({
        enabled: true,
        workerActive: true,
        running: false,
        intervalMs: 3_600_000,
        batchSize: 200,
        maxBatchesPerRun: 50,
        runOnStartup: false,
        effectivePolicies: [],
        lastRun: null,
        recentRuns: [],
      });

      const res = await request(app)
        .get('/api/v1/event-governance/retention-purge/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workerActive).toBe(true);
      expect(eventRetentionPurgeService.getStatus).toHaveBeenCalledWith(adminUserId, true);
    });
  });

  describe('POST /api/v1/event-governance/retention-purge/run', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/event-governance/retention-purge/run')
        .send({ dryRun: true });
      expect(res.status).toBe(401);
    });

    it('rejects non-ADMIN role with 403', async () => {
      vi.mocked(prisma.users.findUnique).mockResolvedValue({
        role: 'SECURITY_OFFICER',
        status: 'ACTIVE',
      } as never);

      const res = await request(app)
        .post('/api/v1/event-governance/retention-purge/run')
        .set('Authorization', `Bearer ${token}`)
        .send({ dryRun: true });

      expect(res.status).toBe(403);
    });

    it('rejects invalid parameters with 422', async () => {
      const res = await request(app)
        .post('/api/v1/event-governance/retention-purge/run')
        .set('Authorization', `Bearer ${token}`)
        .send({ batchSize: 5 });

      expect(res.status).toBe(422);
    });

    it('returns 409 when a purge job is already running', async () => {
      vi.mocked(eventRetentionPurgeService.runManual).mockRejectedValue(
        new AppError(409, 'PURGE_ALREADY_RUNNING', 'A retention purge job is already running'),
      );

      const res = await request(app)
        .post('/api/v1/event-governance/retention-purge/run')
        .set('Authorization', `Bearer ${token}`)
        .send({ dryRun: false });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PURGE_ALREADY_RUNNING');
    });

    it('executes dry-run purge for ADMIN', async () => {
      vi.mocked(eventRetentionPurgeService.runManual).mockResolvedValue({
        status: 'DRY_RUN',
        trigger: 'MANUAL',
        dryRun: true,
        startedAt: '2026-11-26T00:00:00.000Z',
        completedAt: '2026-11-26T00:00:00.200Z',
        durationMs: 200,
        totalDeletedNormalizedEvents: 12,
        totalDeletedInvalidEvents: 3,
        totalProtectedEvents: 2,
        families: [],
      });

      const res = await request(app)
        .post('/api/v1/event-governance/retention-purge/run')
        .set('Authorization', `Bearer ${token}`)
        .send({ dryRun: true, eventFamily: 'AUTHENTICATION' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DRY_RUN');
      expect(eventRetentionPurgeService.runManual).toHaveBeenCalledWith(adminUserId, {
        dryRun: true,
        eventFamily: 'AUTHENTICATION',
      });
    });

    it('accepts omitted body with default dryRun=false', async () => {
      vi.mocked(eventRetentionPurgeService.runManual).mockResolvedValue({
        status: 'COMPLETED',
        trigger: 'MANUAL',
        dryRun: false,
        startedAt: '2026-11-26T00:00:00.000Z',
        completedAt: '2026-11-26T00:00:00.100Z',
        durationMs: 100,
        totalDeletedNormalizedEvents: 0,
        totalDeletedInvalidEvents: 0,
        totalProtectedEvents: 0,
        families: [],
      });

      const res = await request(app)
        .post('/api/v1/event-governance/retention-purge/run')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(eventRetentionPurgeService.runManual).toHaveBeenCalledWith(adminUserId, {
        dryRun: false,
      });
    });
  });
});

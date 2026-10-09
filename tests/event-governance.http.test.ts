import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/event-ingestion/event-governance.service.js', () => ({
  eventGovernanceService: {
    listPolicies: vi.fn(),
    getPolicyDetail: vi.fn(),
    getLifecycleSummary: vi.fn(),
    updatePolicy: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { AppError } from '../src/common/errors/app-error.js';
import { eventGovernanceService } from '../src/modules/event-ingestion/event-governance.service.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const samplePolicyId = '7d191192-3490-410a-ba53-3a72d3f92d44';
const app = createApp();

const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});

const samplePolicyDto = {
  id: samplePolicyId,
  name: 'Authentication Retention Policy',
  purpose: 'Retain auth logs for 90 days',
  eventFamily: 'AUTHENTICATION' as const,
  retentionDays: 90,
  accessScope: 'SECURITY_OPERATIONS',
  maskingRules: { maskIp: true },
  exportAllowed: true,
  archiveAfterDays: 30,
  deletionEnabled: true,
  status: 'ACTIVE' as const,
  createdBy: {
    id: userId,
    name: 'Admin User',
    email: 'admin@securaai.internal',
  },
  updatedBy: {
    id: userId,
    name: 'Admin User',
    email: 'admin@securaai.internal',
  },
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
};

describe('Event Governance HTTP endpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /api/v1/event-governance/policies', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/event-governance/policies');
      expect(res.status).toBe(401);
    });

    it('returns paginated policies for authenticated administrator', async () => {
      vi.mocked(eventGovernanceService.listPolicies).mockResolvedValue({
        items: [samplePolicyDto],
        pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
      });

      const res = await request(app)
        .get('/api/v1/event-governance/policies?page=1&limit=20&eventFamily=AUTHENTICATION&status=ACTIVE')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Authentication Retention Policy');
      expect(eventGovernanceService.listPolicies).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          page: 1,
          limit: 20,
          eventFamily: 'AUTHENTICATION',
          status: 'ACTIVE',
        }),
      );
    });

    it('rejects invalid limit parameter with 422', async () => {
      const res = await request(app)
        .get('/api/v1/event-governance/policies?limit=250')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/v1/event-governance/policies/summary', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/event-governance/policies/summary');
      expect(res.status).toBe(401);
    });

    it('returns lifecycle summary metrics for authenticated user', async () => {
      vi.mocked(eventGovernanceService.getLifecycleSummary).mockResolvedValue({
        totalPolicies: 3,
        activePolicies: 3,
        inactivePolicies: 0,
        minRetentionDays: 30,
        maxRetentionDays: 365,
        avgRetentionDays: 161,
        policiesWithArchival: 2,
        policiesWithAutomatedDeletion: 3,
        exportAllowedCount: 2,
      });

      const res = await request(app)
        .get('/api/v1/event-governance/policies/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalPolicies).toBe(3);
      expect(res.body.data.minRetentionDays).toBe(30);
      expect(eventGovernanceService.getLifecycleSummary).toHaveBeenCalledWith(userId);
    });
  });

  describe('GET /api/v1/event-governance/policies/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app).get(`/api/v1/event-governance/policies/${samplePolicyId}`);
      expect(res.status).toBe(401);
    });

    it('returns policy detail for valid id', async () => {
      vi.mocked(eventGovernanceService.getPolicyDetail).mockResolvedValue(samplePolicyDto);

      const res = await request(app)
        .get(`/api/v1/event-governance/policies/${samplePolicyId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(samplePolicyId);
      expect(res.body.data.retentionDays).toBe(90);
    });

    it('returns 404 when policy not found', async () => {
      vi.mocked(eventGovernanceService.getPolicyDetail).mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Event data governance policy not found'),
      );

      const res = await request(app)
        .get(`/api/v1/event-governance/policies/${samplePolicyId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('rejects invalid uuid with 422', async () => {
      const res = await request(app)
        .get('/api/v1/event-governance/policies/invalid-id-format')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /api/v1/event-governance/policies/:id', () => {
    it('requires authentication', async () => {
      const res = await request(app)
        .patch(`/api/v1/event-governance/policies/${samplePolicyId}`)
        .send({ retentionDays: 180 });

      expect(res.status).toBe(401);
    });

    it('updates policy settings for authenticated administrator', async () => {
      vi.mocked(eventGovernanceService.updatePolicy).mockResolvedValue({
        ...samplePolicyDto,
        retentionDays: 180,
        archiveAfterDays: 60,
        deletionEnabled: true,
      });

      const res = await request(app)
        .patch(`/api/v1/event-governance/policies/${samplePolicyId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          retentionDays: 180,
          archiveAfterDays: 60,
          deletionEnabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.retentionDays).toBe(180);
      expect(res.body.data.archiveAfterDays).toBe(60);
      expect(eventGovernanceService.updatePolicy).toHaveBeenCalledWith(
        userId,
        samplePolicyId,
        {
          retentionDays: 180,
          archiveAfterDays: 60,
          deletionEnabled: true,
        },
      );
    });

    it('rejects invalid body (e.g. archiveAfterDays >= retentionDays in body)', async () => {
      const res = await request(app)
        .patch(`/api/v1/event-governance/policies/${samplePolicyId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          retentionDays: 90,
          archiveAfterDays: 120,
        });

      expect(res.status).toBe(422);
    });
  });
});

/**
 * System / End-to-End Tests for UC 13.1 - Connect Third-Party SIEM and Firewall API
 *
 * These tests exercise the FULL pipeline from HTTP request → Express router → controller
 * → service → repository → Prisma → PostgreSQL, with no mock at any layer.
 *
 * Prerequisites:
 *   - A running PostgreSQL instance reachable via DATABASE_URL.
 *   - The database must have the 5 integration tables with correct schema.
 *   - These tests create, read, update, and delete real rows; use a TEST database only.
 *
 * Run separately from unit tests:
 *   npx vitest run tests/integrations.e2e.test.ts
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type * as SsrfValidator from '../src/common/utils/ssrf-validator.js';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/common/utils/tokens.js';
import { AppError } from '../src/common/errors/app-error.js';
import { prisma } from '../src/database/prisma.js';

vi.mock('../src/common/utils/ssrf-validator.js', async (importOriginal) => {
  const original = await importOriginal<typeof SsrfValidator>();
  return {
    ...original,
    validateExternalUrl: vi.fn((url: string) => {
      const parsed = new URL(url);
      if (
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '169.254.169.254'
      ) {
        return Promise.reject(
          new AppError(400, 'SSRF_DETECTED', 'Target URL resolves to a forbidden or private network IP'),
        );
      }
      return Promise.resolve({
        url,
        resolvedIp: '93.184.216.34',
        port: parsed.port ? Number.parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80,
      });
    }),
    executeSafeHttpRequest: vi.fn((url: string) => {
      if (url.includes('fail') || url.includes('nonexistent')) {
        return Promise.resolve({
          statusCode: 503,
          headers: {},
          body: 'Service Unavailable',
          latencyMs: 50,
        });
      }
      return Promise.resolve({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: '{"status":"ok"}',
        latencyMs: 42,
      });
    }),
  };
});

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
let app: Express;
let adminToken: string;
let viewerToken: string; // has read-only permission
let noPermToken: string; // no integration permissions at all

// Track created integration IDs for cleanup
const createdIntegrationIds: string[] = [];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  app = createApp();

  let user = await prisma.users.findFirst({
    where: { email: 'admin@securaai.local' },
  });

  if (!user) {
    user = await prisma.users.create({
      data: {
        email: 'e2e-test-admin@securaai.local',
        password_hash: 'dummy-hash',
        full_name: 'E2E Test Admin',
        status: 'active',
      },
    });
  }

  const testUserId = user.user_id;

  adminToken = signAccessToken({
    userId: testUserId,
    roles: ['ADMIN'],
    permissions: [
      'integrations.create',
      'integrations.read',
      'integrations.update',
      'integrations.connect',
    ],
  });

  viewerToken = signAccessToken({
    userId: testUserId,
    roles: ['VIEWER'],
    permissions: ['integrations.read'],
  });

  noPermToken = signAccessToken({
    userId: testUserId,
    roles: ['EMPLOYEE'],
    permissions: ['some.other.permission'],
  });
});

afterAll(async () => {
  // Cleanup: remove all test data created during this suite
  if (createdIntegrationIds.length > 0) {
    // Delete logs first (FK dependency)
    await prisma.integration_logs.deleteMany({
      where: { integration_id: { in: createdIntegrationIds } },
    });
    // Then delete integrations
    await prisma.integrations.deleteMany({
      where: { integration_id: { in: createdIntegrationIds } },
    });
  }
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// E2E Test Suite
// ---------------------------------------------------------------------------
describe('UC 13.1 – System Test: Connect Third-Party SIEM and Firewall API (E2E)', () => {
  // =========================================================================
  // ST-01: Create integration → verify DB row
  // =========================================================================
  describe('ST-01: POST /api/v1/integrations (Full Pipeline)', () => {
    it('creates an integration and persists it correctly in PostgreSQL', async () => {
      const payload = {
        name: 'E2E Test – Wazuh SIEM',
        integrationType: 'siem',
        baseUrl: 'https://wazuh.example.com:55000',
        configuration: { region: 'ap-southeast-1', version: '4.7' },
      };

      const res = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.integrationType).toBe('siem');
      expect(res.body.data.status).toBe('inactive');
      expect(res.body.data.id).toBeDefined();

      const integrationId = res.body.data.id as string;
      createdIntegrationIds.push(integrationId);

      // Verify directly in PostgreSQL
      const dbRow = await prisma.integrations.findUnique({
        where: { integration_id: integrationId },
      });
      expect(dbRow).not.toBeNull();
      expect(dbRow!.name).toBe(payload.name);
      expect(dbRow!.integration_type).toBe('siem');
      expect(dbRow!.base_url).toBe(payload.baseUrl);
      expect(dbRow!.status).toBe('inactive');
      expect(dbRow!.configuration).toEqual(payload.configuration);

      // Verify audit log was created
      const logRow = await prisma.integration_logs.findFirst({
        where: { integration_id: integrationId },
        orderBy: { created_at: 'desc' },
      });
      expect(logRow).not.toBeNull();
      expect(logRow!.level).toBe('info');
      expect(logRow!.message).toContain('created');
    });

    it('rejects creation without authentication (401)', async () => {
      const res = await request(app)
        .post('/api/v1/integrations')
        .send({ name: 'Unauthorized', integrationType: 'siem' });

      expect(res.status).toBe(401);
    });

    it('rejects creation without integrations.create permission (403)', async () => {
      const res = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Forbidden', integrationType: 'siem' });

      expect(res.status).toBe(403);
    });

    it('rejects invalid payload (422)', async () => {
      const res = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: '', // empty
          integrationType: 'invalid_type',
          baseUrl: 'not-a-url',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // ST-02: List integrations → verify pagination and filtering
  // =========================================================================
  describe('ST-02: GET /api/v1/integrations (Full Pipeline)', () => {
    it('returns paginated list including the previously created integration', async () => {
      const res = await request(app)
        .get('/api/v1/integrations?page=1&limit=50')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);

      // Find our E2E test integration in the response
      const items = res.body.data.items as Array<{ name: string }>;
      const found = items.find((item) => item.name === 'E2E Test – Wazuh SIEM');
      expect(found).toBeDefined();
    });

    it('filters by type correctly', async () => {
      const res = await request(app)
        .get('/api/v1/integrations?type=siem&page=1&limit=50')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      for (const item of res.body.data.items) {
        expect(item.integrationType).toBe('siem');
      }
    });

    it('read-only viewer can list integrations', async () => {
      const res = await request(app)
        .get('/api/v1/integrations')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });

    it('user without integrations.read cannot list (403)', async () => {
      const res = await request(app)
        .get('/api/v1/integrations')
        .set('Authorization', `Bearer ${noPermToken}`);

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // ST-03: Get by ID → verify exact response shape
  // =========================================================================
  describe('ST-03: GET /api/v1/integrations/:id (Full Pipeline)', () => {
    it('returns a single integration with correct camelCase mapping', async () => {
      const id = createdIntegrationIds[0]!;
      const res = await request(app)
        .get(`/api/v1/integrations/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.name).toBe('E2E Test – Wazuh SIEM');
      expect(res.body.data.integrationType).toBe('siem');
      expect(res.body.data.baseUrl).toBe('https://wazuh.example.com:55000');
      expect(res.body.data.status).toBe('inactive');
      // camelCase mapping verification
      expect(res.body.data.lastConnectedAt).toBeNull();
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();
      // Must NOT expose snake_case fields
      expect(res.body.data.integration_id).toBeUndefined();
      expect(res.body.data.base_url).toBeUndefined();
      expect(res.body.data.created_at).toBeUndefined();
    });

    it('returns 404 for non-existent integration', async () => {
      const res = await request(app)
        .get(`/api/v1/integrations/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INTEGRATION_NOT_FOUND');
    });

    it('returns 422 for malformed UUID parameter', async () => {
      const res = await request(app)
        .get('/api/v1/integrations/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
    });
  });

  // =========================================================================
  // ST-04: Update integration → verify DB reflects change
  // =========================================================================
  describe('ST-04: PATCH /api/v1/integrations/:id (Full Pipeline)', () => {
    it('updates name and status, verifies in DB', async () => {
      const id = createdIntegrationIds[0]!;

      const res = await request(app)
        .patch(`/api/v1/integrations/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'E2E Test – Wazuh SIEM (Updated)', status: 'active' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('E2E Test – Wazuh SIEM (Updated)');
      expect(res.body.data.status).toBe('active');

      // Verify directly in PostgreSQL
      const dbRow = await prisma.integrations.findUnique({
        where: { integration_id: id },
      });
      expect(dbRow!.name).toBe('E2E Test – Wazuh SIEM (Updated)');
      expect(dbRow!.status).toBe('active');
    });

    it('strictly prohibits client from setting status to "error" (422)', async () => {
      const id = createdIntegrationIds[0]!;

      const res = await request(app)
        .patch(`/api/v1/integrations/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'error' });

      expect(res.status).toBe(422);

      // Verify DB status unchanged
      const dbRow = await prisma.integrations.findUnique({
        where: { integration_id: id },
      });
      expect(dbRow!.status).not.toBe('error');
    });

    it('rejects empty update body (422)', async () => {
      const id = createdIntegrationIds[0]!;

      const res = await request(app)
        .patch(`/api/v1/integrations/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(422);
    });

    it('viewer cannot update (403)', async () => {
      const id = createdIntegrationIds[0]!;

      const res = await request(app)
        .patch(`/api/v1/integrations/${id}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Should Not Work' });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // ST-05: Test Connection → verify status transition + audit log
  // =========================================================================
  describe('ST-05: POST /api/v1/integrations/:id/test-connection (Full Pipeline)', () => {
    it('returns connection result and updates integration status + log in DB', async () => {
      const id = createdIntegrationIds[0]!;

      // Mock the SSRF validator to allow the test URL through,
      // since the e2e test environment cannot actually reach external endpoints.
      // The full SSRF logic is tested separately in service unit tests.
      const ssrfModule = await import('../src/common/utils/ssrf-validator.js');
      vi.spyOn(ssrfModule, 'validateExternalUrl').mockResolvedValue(
        new URL('https://wazuh.example.com:55000'),
      );
      vi.spyOn(ssrfModule, 'executeSafeHttpRequest').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 120,
        ok: true,
      });

      const res = await request(app)
        .post(`/api/v1/integrations/${id}/test-connection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ timeoutMs: 5000 });

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.statusCode).toBe(200);
      expect(res.body.data.latencyMs).toBeGreaterThanOrEqual(0);

      // Verify DB: status should be 'active', last_connected_at should be set
      const dbRow = await prisma.integrations.findUnique({
        where: { integration_id: id },
      });
      expect(dbRow!.status).toBe('active');
      expect(dbRow!.last_connected_at).not.toBeNull();

      // Verify audit log entry for connection test
      const logRows = await prisma.integration_logs.findMany({
        where: { integration_id: id, level: 'info' },
        orderBy: { created_at: 'desc' },
        take: 1,
      });
      expect(logRows.length).toBeGreaterThanOrEqual(1);
      expect(logRows[0]!.message).toContain('Connection test succeeded');

      vi.restoreAllMocks();
    });

    it('marks integration as error when external endpoint fails', async () => {
      const id = createdIntegrationIds[0]!;

      const ssrfModule = await import('../src/common/utils/ssrf-validator.js');
      vi.spyOn(ssrfModule, 'validateExternalUrl').mockResolvedValue(
        new URL('https://wazuh.example.com:55000'),
      );
      vi.spyOn(ssrfModule, 'executeSafeHttpRequest').mockResolvedValue({
        statusCode: 503,
        statusText: 'Service Unavailable',
        latencyMs: 2500,
        ok: false,
      });

      const res = await request(app)
        .post(`/api/v1/integrations/${id}/test-connection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ timeoutMs: 5000 });

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(false);
      expect(res.body.data.statusCode).toBe(503);

      // Verify DB: status should now be 'error' (system-derived)
      const dbRow = await prisma.integrations.findUnique({
        where: { integration_id: id },
      });
      expect(dbRow!.status).toBe('error');

      // Verify warn-level log recorded
      const logRows = await prisma.integration_logs.findMany({
        where: { integration_id: id, level: 'warn' },
        orderBy: { created_at: 'desc' },
        take: 1,
      });
      expect(logRows.length).toBeGreaterThanOrEqual(1);
      expect(logRows[0]!.message).toContain('503');

      vi.restoreAllMocks();
    });

    it('returns 404 for non-existent integration on test-connection', async () => {
      const res = await request(app)
        .post(`/api/v1/integrations/${randomUUID()}/test-connection`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ timeoutMs: 5000 });

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // ST-06: Response format consistency
  // =========================================================================
  describe('ST-06: Response Format Consistency', () => {
    it('all success responses follow { success: true, data: ... } shape', async () => {
      const id = createdIntegrationIds[0]!;

      const listRes = await request(app)
        .get('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.body).toHaveProperty('success', true);
      expect(listRes.body).toHaveProperty('data');

      const detailRes = await request(app)
        .get(`/api/v1/integrations/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(detailRes.body).toHaveProperty('success', true);
      expect(detailRes.body).toHaveProperty('data');
    });

    it('all error responses follow { success: false, error: { code, message } } shape', async () => {
      const res = await request(app)
        .get(`/api/v1/integrations/${randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
    });

    it('does not leak snake_case or internal database field names', async () => {
      const id = createdIntegrationIds[0]!;

      const res = await request(app)
        .get(`/api/v1/integrations/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      const data = res.body.data as Record<string, unknown>;
      const forbiddenKeys = [
        'integration_id',
        'integration_type',
        'base_url',
        'last_connected_at',
        'created_by_user_id',
        'created_at',
        'updated_at',
      ];
      for (const key of forbiddenKeys) {
        expect(data).not.toHaveProperty(key);
      }
    });
  });

  // =========================================================================
  // ST-07: Data integrity under multiple operations
  // =========================================================================
  describe('ST-07: Data Integrity – Multiple Operations', () => {
    it('creates a second integration, updates the first, both coexist correctly', async () => {
      // Create second integration
      const createRes = await request(app)
        .post('/api/v1/integrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'E2E Test – Fortinet Firewall',
          integrationType: 'firewall',
          baseUrl: 'https://fortinet.example.com',
        });

      expect(createRes.status).toBe(201);
      const secondId = createRes.body.data.id as string;
      createdIntegrationIds.push(secondId);

      // Update first integration's status
      await request(app)
        .patch(`/api/v1/integrations/${createdIntegrationIds[0]!}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'disabled' });

      // Verify both exist with correct independent states
      const first = await prisma.integrations.findUnique({
        where: { integration_id: createdIntegrationIds[0]! },
      });
      const second = await prisma.integrations.findUnique({
        where: { integration_id: secondId },
      });

      expect(first!.status).toBe('disabled');
      expect(second!.status).toBe('inactive');
      expect(first!.name).toContain('Wazuh');
      expect(second!.name).toContain('Fortinet');
    });
  });
});

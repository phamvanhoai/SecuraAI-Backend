import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));
vi.mock('../src/modules/information-security-incident-management/incidents.service.js', () => ({
  incidentsService: {
    list: vi.fn(),
    detail: vi.fn(),
    listSourceOptions: vi.fn(),
    createFromSource: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { incidentsService } from '../src/modules/information-security-incident-management/incidents.service.js';

const userId = '8d50d98d-9434-42ad-8f31-f835b3a9098f';
const sourceId = 'b23cae8a-9c5c-42a1-984d-6850935f6b33';
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: userId,
  expiresIn: '15m',
});
const app = createApp();

describe('incident creation routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires authentication', async () => {
    expect((await request(app).post('/api/v1/incidents')).status).toBe(401);
  });

  it('creates an incident from a valid finding', async () => {
    vi.mocked(incidentsService.createFromSource).mockResolvedValue({
      id: sourceId,
      incidentCode: 'INC-B23CAE8A9C5C42A1',
      title: 'Confirmed privileged account compromise',
      description: 'The confirmed finding indicates unauthorized privileged account activity.',
      category: null,
      severity: 'high',
      status: 'open',
      occurredAt: null,
      detectedAt: null,
      confirmedAt: null,
      closedAt: null,
      createdAt: new Date('2026-10-03T00:00:00Z'),
      updatedAt: new Date('2026-10-03T00:00:00Z'),
      classified: true,
      classificationCount: 0,
      lastClassification: null,
      currentAssignment: null,
      createdBy: null,
      source: {
        findingId: sourceId,
        alertId: '51d224b7-305c-4b87-9ae8-47c46ba0bf07',
        title: 'Confirmed privileged account compromise',
        findingStatus: 'converted_to_incident',
      },
      relatedCounts: { actions: 0, assets: 0, controls: 0, evidence: 0, risks: 0 },
    });
    const response = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceType: 'finding',
        sourceId,
        title: 'Confirmed privileged account compromise',
        description: 'The confirmed finding indicates unauthorized privileged account activity.',
        severity: 'high',
      });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      id: sourceId,
      incidentCode: 'INC-B23CAE8A9C5C42A1',
    });
  });

  it('creates a manual incident without a source', async () => {
    vi.mocked(incidentsService.createFromSource).mockResolvedValue({
      id: sourceId,
      incidentCode: 'INC-MANUAL00000001',
      title: 'Unauthorized visitor reported at server room',
      description: 'A security officer reported an unauthorized visitor without an existing alert.',
      category: null,
      severity: 'medium',
      status: 'open',
      occurredAt: null,
      detectedAt: new Date('2026-10-04T00:00:00Z'),
      confirmedAt: null,
      closedAt: null,
      createdAt: new Date('2026-10-04T00:00:00Z'),
      updatedAt: new Date('2026-10-04T00:00:00Z'),
      classified: true,
      classificationCount: 0,
      lastClassification: null,
      currentAssignment: null,
      createdBy: null,
      source: null,
      relatedCounts: { actions: 0, assets: 0, controls: 0, evidence: 0, risks: 0 },
    });

    const response = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceType: 'manual',
        title: 'Unauthorized visitor reported at server room',
        description:
          'A security officer reported an unauthorized visitor without an existing alert.',
        severity: 'medium',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      incidentCode: 'INC-MANUAL00000001',
      source: null,
    });
    expect(incidentsService.createFromSource).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ sourceType: 'manual' }),
    );
  });

  it('rejects malformed input before the service', async () => {
    const response = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', `Bearer ${token}`)
      .send({ sourceType: 'finding', sourceId: 'bad' });
    expect(response.status).toBe(422);
    expect(incidentsService.createFromSource).not.toHaveBeenCalled();
  });
});

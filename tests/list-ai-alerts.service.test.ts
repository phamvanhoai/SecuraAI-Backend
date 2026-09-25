import { Prisma, user_role, user_status } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: { list: vi.fn() },
}));

import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';

const query = { page: 1, limit: 20, sortOrder: 'desc' as const };

describe('list AI alerts service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows only active Security Officers', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.ADMIN,
      status: user_status.ACTIVE,
    });
    await expect(aiAlertsService.list('u', query)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('maps V2 anomaly relations to the alert feed contract', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: 'u',
      role: user_role.SECURITY_OFFICER,
      status: user_status.ACTIVE,
    });
    vi.mocked(aiAlertsRepository.list).mockResolvedValue([
      1,
      [
        {
          id: '00000000-0000-4000-8000-000000000001',
          severity: 'HIGH',
          status: 'NEW',
          generated_at: new Date('2026-09-25T01:00:00Z'),
          created_at: new Date('2026-09-25T01:00:00Z'),
          anomaly_detections: {
            anomaly_score: new Prisma.Decimal('0.91'),
            detected_at: new Date('2026-09-25T01:00:00Z'),
            ai_model_versions: {
              id: '00000000-0000-4000-8000-000000000002',
              model_name: 'detector',
              model_type: 'BEHAVIORAL',
              version: '1',
            },
            normalized_events: {
              id: '00000000-0000-4000-8000-000000000003',
              event_type: 'privileged_login',
              occurred_at: new Date('2026-09-25T00:59:00Z'),
              event_sources: {
                id: '00000000-0000-4000-8000-000000000004',
                name: 'Identity',
                source_type: 'IDP',
              },
              event_entity_mappings: [],
            },
          },
        },
      ],
    ]);
    const result = await aiAlertsService.list('u', query);
    expect(result.items[0]).toMatchObject({
      alertCode: 'ALT-00000000',
      anomalyScore: 0.91,
      status: 'new',
      title: 'Privileged login',
      asset: null,
    });
    expect(result.pagination).toMatchObject({ total: 1, totalPages: 1 });
  });
});

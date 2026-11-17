import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));

import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import { aiAlertRealtimeService } from '../src/modules/ai-anomaly-detection-alerts/ai-alert-realtime.service.js';

const userId = '7286c533-1d39-47c3-8734-d13fc55fcc8d';

describe('AI alert realtime tickets', () => {
  beforeEach(() => vi.resetAllMocks());

  it('issues and verifies a short-lived ticket for an active Security Officer', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });

    const result = await aiAlertRealtimeService.issueTicket(userId);

    expect(result).toMatchObject({
      expiresInSeconds: 30,
      path: '/api/v1/ai-alerts/realtime',
    });
    expect(aiAlertRealtimeService.verifyTicket(result.ticket)).toBe(userId);
    expect(aiAlertRealtimeService.verifyTicket(`${result.ticket}tampered`)).toBeNull();
  });

  it('rejects an Employee before issuing a ticket', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });

    await expect(aiAlertRealtimeService.issueTicket(userId)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});

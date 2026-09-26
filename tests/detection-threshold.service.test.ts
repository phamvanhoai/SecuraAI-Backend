import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js', () => ({
  anomalyDetectionRepository: { findActor: vi.fn() },
}));
vi.mock('../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js', () => ({
  aiAlertsRepository: {
    findDeployedModelThreshold: vi.fn(),
    configureDeployedModelThreshold: vi.fn(),
  },
}));

import { aiAlertsRepository } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.repository.js';
import { aiAlertsService } from '../src/modules/ai-anomaly-detection-alerts/ai-alerts.service.js';
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';

const userId = '9a9bf33a-02db-48e4-a8ad-90517278d7f2';
const model = {
  id: 'c82662ff-8cb7-4e97-b5f6-b0b1d9cb54c8',
  model_name: 'Secura Detector',
  version: '2.0',
  status: 'DEPLOYED' as const,
  parameters: { threshold: 0.8 },
  deployed_at: new Date('2026-09-25T00:00:00Z'),
};

describe('detection threshold service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiAlertsRepository.findDeployedModelThreshold).mockResolvedValue(model);
    vi.mocked(aiAlertsRepository.configureDeployedModelThreshold).mockResolvedValue({
      ...model,
      parameters: { threshold: 0.9 },
    });
  });

  it.each(['SECURITY_OFFICER', 'EXECUTIVE'] as const)('allows active %s accounts', async (role) => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role,
    });
    await expect(
      aiAlertsService.configureDetectionThreshold(userId, { threshold: 0.9 }),
    ).resolves.toMatchObject({ threshold: 0.9 });
  });

  it('rejects roles outside the assigned actors', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'ADMIN',
    });
    await expect(aiAlertsService.getDetectionThreshold(userId)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('requires a deployed model', async () => {
    vi.mocked(anomalyDetectionRepository.findActor).mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
      role: 'EXECUTIVE',
    });
    vi.mocked(aiAlertsRepository.findDeployedModelThreshold).mockResolvedValue(null);
    await expect(aiAlertsService.getDetectionThreshold(userId)).rejects.toMatchObject({
      statusCode: 409,
      code: 'NO_DEPLOYED_MODEL',
    });
  });
});

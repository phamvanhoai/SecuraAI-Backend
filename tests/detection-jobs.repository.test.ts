import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), $executeRaw: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({ prisma: db }));
import { detectionJobsRepository } from '../src/modules/ai-anomaly-detection-alerts/detection-jobs.repository.js';
beforeEach(() => vi.resetAllMocks());
describe('durable queue SQL boundaries', () => {
  it('claims using skip-locked leases and bounds retries without interpolating IDs into SQL', async () => {
    db.$queryRaw.mockResolvedValue([{ id: 'job', event_id: 'event', alert_id: null }]);
    const result = await detectionJobsRepository.claim(
      'model-id',
      100,
      'DETECTION',
      'WAZUH_REALTIME',
    );
    const sql = (db.$queryRaw.mock.calls[0]?.[0] as readonly string[]).join('?');
    expect(sql).toContain('SKIP LOCKED');
    expect(sql).toContain('j.attempts<5');
    expect(sql).toContain("interval '10 minutes'");
    expect(result.token).toMatch(/^[a-f0-9-]{36}$/);
    expect(sql).not.toContain('model-id');
    expect(JSON.stringify(db.$queryRaw.mock.calls[0])).toContain('ingestion_batch_id IS NULL');
  });
  it('backs off only the failed lease and eventually marks exhausted jobs failed', async () => {
    await detectionJobsRepository.fail('lease-token');
    const sql = (db.$executeRaw.mock.calls[0]?.[0] as readonly string[]).join('?');
    expect(sql).toContain("THEN 'FAILED' ELSE 'PENDING'");
    expect(sql).toContain('WHERE lease_token=');
    expect(sql).not.toContain('lease-token');
  });
  it('discovers committed events without replaying prior model results', async () => {
    await detectionJobsRepository.discover('model', 'WAZUH_REALTIME');
    const sql = (db.$executeRaw.mock.calls[0]?.[0] as readonly string[]).join('?');
    expect(sql).toContain('NOT EXISTS(SELECT 1 FROM anomaly_detections');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    expect(sql).toContain('LIMIT 500');
  });
});

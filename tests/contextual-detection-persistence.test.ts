import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  anomaly_detections: { createMany: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  anomaly_feature_contributions: { createMany: vi.fn() },
  anomaly_alerts: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  audit_logs: { findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { $transaction: (fn: (value: typeof db) => Promise<unknown>) => fn(db) },
}));
import { anomalyDetectionRepository } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
const time = new Date('2026-10-30T02:00:00Z');
const detection = (id: string, minutes = 0) => ({
  id,
  eventId: `event-${id}`,
  score: 0.9,
  threshold: 0.99,
  thresholdSource: 'MODEL_DEFAULT',
  isAnomaly: true,
  occurredAt: new Date(time.getTime() + minutes * 60_000),
  groupKey: 'same-rule-account-ip-source',
  features: [
    {
      featureName: 'matched_rules',
      featureValue: '["AUTH_FAILURE_BURST"]',
      contributionScore: 0.9,
      rank: 1,
    },
  ],
  explanationText: 'Rule matched independently of threshold.',
  explanationGeneratedAt: time,
});
const input = (detections: ReturnType<typeof detection>[]) => ({
  actor: { type: 'SYSTEM' as const },
  modelVersionId: 'model',
  detections,
  summary: {},
});
beforeEach(() => {
  vi.resetAllMocks();
  db.$queryRaw.mockResolvedValue([{ id: 'locked-alert' }]);
  db.anomaly_alerts.findFirst.mockResolvedValue(null);
  db.anomaly_detections.findUniqueOrThrow.mockResolvedValue({
    anomaly_score: { toNumber: () => 0.9 },
    anomaly_feature_contributions: [],
  });
  db.audit_logs.findFirst.mockResolvedValue(null);
});
describe('contextual detection persistence', () => {
  it('raises priority on stronger grouped evidence while preserving the original detection', async () => {
    db.anomaly_detections.createMany.mockResolvedValue({ count: 1 });
    db.anomaly_detections.findMany.mockResolvedValue([{ id: 'b' }]);
    db.anomaly_detections.findUniqueOrThrow.mockResolvedValue({
      anomaly_score: { toNumber: () => 0.57 },
      anomaly_feature_contributions: [],
    });
    db.anomaly_alerts.findFirst.mockResolvedValue({
      detection_id: 'prior',
      anomaly_detections: { normalized_events: { occurred_at: time } },
    });
    await anomalyDetectionRepository.persistRun(input([detection('b', 2)]));
    expect(db.anomaly_alerts.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: 'CRITICAL' }) }),
    );
    expect(db.anomaly_feature_contributions.createMany).toHaveBeenLastCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          feature_name: 'alert_score_update',
          feature_value: expect.stringContaining('"previousScore":0.57'),
        }),
      ]),
    });
  });
  it('does not group into an alert that becomes terminal before the row lock', async () => {
    db.anomaly_detections.createMany.mockResolvedValue({ count: 1 });
    db.anomaly_detections.findMany.mockResolvedValue([{ id: 'a' }]);
    db.anomaly_alerts.findFirst.mockResolvedValue({
      detection_id: 'closed',
      anomaly_detections: { normalized_events: { occurred_at: time } },
    });
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect(await anomalyDetectionRepository.persistRun(input([detection('a')]))).toMatchObject({
      alertsCreated: 1,
      alertsGrouped: 0,
    });
  });
  it('stores detections/features but groups repeated rule matches into one open alert', async () => {
    db.anomaly_detections.createMany.mockResolvedValue({ count: 2 });
    db.anomaly_detections.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result = await anomalyDetectionRepository.persistRun(
      input([detection('a'), detection('b', 1)]),
    );
    expect(result).toEqual({ detectionsCreated: 2, alertsCreated: 1, alertsGrouped: 1 });
    expect(db.$queryRaw).toHaveBeenCalledOnce();
    const sqlParts = db.$queryRaw.mock.calls[0]?.[0] as readonly string[];
    expect(sqlParts.join('?')).toContain(
      'pg_advisory_xact_lock(hashtextextended(?, 0))::text AS locked',
    );
    expect(db.anomaly_alerts.create).toHaveBeenCalledOnce();
    expect(db.anomaly_feature_contributions.createMany).toHaveBeenLastCalledWith({
      data: [
        expect.objectContaining({
          detection_id: 'a',
          feature_name: 'correlated_detection',
          feature_value: expect.stringContaining('event-b'),
        }),
      ],
    });
  });
  it('retains cross-batch evidence and restricts grouping to open statuses, matching model and event-time window', async () => {
    db.anomaly_detections.createMany.mockResolvedValue({ count: 1 });
    db.anomaly_detections.findMany.mockResolvedValue([{ id: 'b' }]);
    db.anomaly_alerts.findFirst.mockResolvedValue({
      detection_id: 'prior',
      anomaly_detections: { normalized_events: { occurred_at: time } },
    });
    expect(await anomalyDetectionRepository.persistRun(input([detection('b', 2)]))).toMatchObject({
      alertsCreated: 0,
      alertsGrouped: 1,
    });
    expect(db.anomaly_alerts.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['NEW', 'IN_TRIAGE', 'NEED_INVESTIGATION'] },
          anomaly_detections: expect.objectContaining({ model_version_id: 'model' }),
        }),
      }),
    );
    expect(db.anomaly_alerts.create).not.toHaveBeenCalled();
  });
  it('does not append evidence or create another alert when another worker already persisted an event', async () => {
    db.anomaly_detections.createMany.mockResolvedValue({ count: 0 });
    db.anomaly_detections.findMany.mockResolvedValue([]);
    expect(await anomalyDetectionRepository.persistRun(input([detection('duplicate')]))).toEqual({
      detectionsCreated: 0,
      alertsCreated: 0,
      alertsGrouped: 0,
    });
    expect(db.anomaly_alerts.create).not.toHaveBeenCalled();
    expect(db.anomaly_alerts.findFirst).not.toHaveBeenCalled();
  });
  it('starts another alert outside the fixed grouping window', async () => {
    db.anomaly_detections.createMany.mockResolvedValue({ count: 2 });
    db.anomaly_detections.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    expect(
      await anomalyDetectionRepository.persistRun(input([detection('a'), detection('b', 16)])),
    ).toMatchObject({ alertsCreated: 2, alertsGrouped: 0 });
  });
});

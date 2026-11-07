import { env } from '../../config/env.js';
import { detectionJobsRepository } from './detection-jobs.repository.js';

export async function eventPipelineStatuses(ids: string[]) {
  if (!env.DETECTION_PIPELINE_ENABLED)
    return new Map<string, { status: string; score: number | null; alertId: string | null }>();
  const rows = await detectionJobsRepository.statuses(ids);
  return new Map(
    rows.map((row) => {
      const result = typeof row.result === 'object' && row.result !== null ? row.result : {};
      const score = 'score' in result && typeof result.score === 'number' ? result.score : null;
      const status =
        row.status === 'COMPLETED'
          ? 'isAnomaly' in result && result.isAnomaly === true
            ? 'LINKED_TO_ALERT'
            : 'BELOW_THRESHOLD'
          : row.status;
      return [row.event_id, { status, score, alertId: row.alert_id }] as const;
    }),
  );
}

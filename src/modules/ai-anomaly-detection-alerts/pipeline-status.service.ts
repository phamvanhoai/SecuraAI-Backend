import { detectionJobsRepository } from './detection-jobs.repository.js';

export async function eventPipelineStatuses(ids: string[]) {
  const rows = await detectionJobsRepository.statuses(ids);
  return new Map(
    rows.map((row) => {
      const result = typeof row.result === 'object' && row.result !== null ? row.result : {};
      const score = 'score' in result && typeof result.score === 'number' ? result.score : null;
      const errorMessage =
        'message' in result && typeof result.message === 'string' ? result.message : null;
      const status =
        row.status === 'COMPLETED'
          ? 'isAnomaly' in result && result.isAnomaly === true
            ? 'LINKED_TO_ALERT'
            : 'outcome' in result &&
                (result.outcome === 'LLM_BENIGN' || result.outcome === 'LLM_SUSPICIOUS')
              ? result.outcome
              : 'BELOW_THRESHOLD'
          : row.status;
      return [
        row.event_id,
        {
          status,
          score,
          alertId: row.alert_id,
          errorCode: row.error_code,
          errorMessage,
          retryable: row.status === 'FAILED',
        },
      ] as const;
    }),
  );
}

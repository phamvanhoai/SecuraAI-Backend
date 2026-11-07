import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

export const pipelineEngine = 'history-pipeline-v1';
export const detectionJobsRepository = {
  async discover(modelId: string, scope: 'ALL' | 'WAZUH_REALTIME') {
    const scopeSql =
      scope === 'WAZUH_REALTIME'
        ? Prisma.sql`AND e.ingestion_batch_id IS NULL AND s.source_type='WAZUH' AND s.ingestion_method='API'`
        : Prisma.empty;
    await prisma.$executeRaw`INSERT INTO detection_jobs(kind,event_id,model_version_id,engine_version)
      SELECT 'DETECTION',e.id,${modelId}::uuid,${pipelineEngine}
      FROM normalized_events e JOIN event_sources s ON s.id=e.event_source_id
      WHERE NOT EXISTS(SELECT 1 FROM anomaly_detections d WHERE d.event_id=e.id AND d.model_version_id=${modelId}::uuid)
      ${scopeSql} AND NOT EXISTS(SELECT 1 FROM detection_jobs j WHERE j.event_id=e.id AND j.model_version_id=${modelId}::uuid AND j.engine_version=${pipelineEngine})
      ORDER BY e.occurred_at,e.id LIMIT 500 ON CONFLICT DO NOTHING`;
  },
  async claim(
    modelId: string,
    take: number,
    kind: 'DETECTION' | 'EXPLANATION',
    scope: 'ALL' | 'WAZUH_REALTIME' = 'ALL',
  ) {
    const token = randomUUID();
    const scopeSql =
      kind === 'DETECTION' && scope === 'WAZUH_REALTIME'
        ? Prisma.sql`AND EXISTS(SELECT 1 FROM normalized_events e JOIN event_sources s ON s.id=e.event_source_id WHERE e.id=j.event_id AND e.ingestion_batch_id IS NULL AND s.source_type='WAZUH' AND s.ingestion_method='API')`
        : Prisma.empty;
    const jobs = await prisma.$queryRaw<
      Array<{ id: string; event_id: string | null; alert_id: string | null }>
    >`
      WITH selected AS (SELECT j.id FROM detection_jobs j LEFT JOIN normalized_events e ON e.id=j.event_id
        WHERE j.kind=${kind} AND j.model_version_id=${modelId}::uuid AND j.engine_version=${pipelineEngine}
          AND j.attempts<5 AND j.available_at<=now()
          AND (j.status='PENDING' OR (j.status='PROCESSING' AND j.lease_until<now())) ${scopeSql}
        ORDER BY e.occurred_at NULLS LAST,j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT ${take})
      UPDATE detection_jobs j SET status='PROCESSING',attempts=attempts+1,lease_token=${token}::uuid,
        lease_until=now()+interval '10 minutes',updated_at=now() FROM selected WHERE j.id=selected.id
      RETURNING j.id,j.event_id,j.alert_id`;
    await prisma.$executeRaw`UPDATE detection_jobs SET status='FAILED',error_code='RETRIES_EXHAUSTED',updated_at=now()
      WHERE attempts>=5 AND status='PROCESSING' AND lease_until<now() AND engine_version=${pipelineEngine}`;
    return { token, jobs };
  },
  async fail(token: string) {
    await prisma.$executeRaw`UPDATE detection_jobs SET status=CASE WHEN attempts>=5 THEN 'FAILED' ELSE 'PENDING' END,
      available_at=now()+interval '30 seconds'*attempts,lease_token=NULL,lease_until=NULL,error_code='PROCESSING_FAILED',updated_at=now()
      WHERE lease_token=${token}::uuid AND status='PROCESSING'`;
  },
  async statuses(ids: string[]) {
    if (!ids.length) return [];
    return prisma.$queryRaw<
      Array<{ event_id: string; status: string; result: unknown; alert_id: string | null }>
    >`
      SELECT DISTINCT ON(j.event_id) j.event_id,j.status,j.result,linked.id AS alert_id FROM detection_jobs j
      LEFT JOIN anomaly_detections d ON d.event_id=j.event_id AND d.model_version_id=j.model_version_id AND d.engine_version=j.engine_version
      LEFT JOIN LATERAL (SELECT a.id FROM anomaly_alerts a WHERE a.detection_id=d.id OR EXISTS (
        SELECT 1 FROM anomaly_feature_contributions f WHERE f.detection_id=a.detection_id AND f.feature_name='correlated_detection' AND f.feature_value::jsonb->>'detectionId'=d.id::text)
        LIMIT 1) linked ON true
      WHERE j.event_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY j.event_id,j.created_at DESC,j.id DESC`;
  },
};

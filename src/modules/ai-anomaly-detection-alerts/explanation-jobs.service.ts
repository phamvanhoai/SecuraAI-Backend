import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { detectionJobsRepository, pipelineEngine } from './detection-jobs.repository.js';
import { anomalyDetectionRepository } from './anomaly-detection.repository.js';
import { aiAlertsRepository } from './ai-alerts.repository.js';
import { ollamaClient } from './ollama.client.js';
import { peakSnapshot } from './alert-score-snapshot.js';

export async function runExplanationJobs(): Promise<void> {
  const model = await anomalyDetectionRepository.findDeployedModel();
  if (!model) return;
  const claimed = await detectionJobsRepository.claim(model.id, 1, 'EXPLANATION');
  for (const job of claimed.jobs) {
    try {
      if (!job.alert_id) throw new Error('Missing alert target');
      const alert = await aiAlertsRepository.findExplanationForRegeneration(job.alert_id);
      if (!alert) throw new Error('Alert unavailable');
      if (env.OLLAMA_ENABLED) {
        const detection = alert.anomaly_detections;
        const peak = peakSnapshot(
          detection.anomaly_feature_contributions,
          detection.anomaly_score.toNumber(),
        );
        const generated = await ollamaClient.generateAlertExplanation({
          anomalyScore: peak?.score ?? detection.anomaly_score.toNumber(),
          threshold: peak?.threshold ?? detection.threshold.toNumber(),
          suggestedRiskLevel: alert.severity?.toLowerCase() ?? null,
          detectedAt: detection.detected_at,
          featureContributions:
            peak?.features ??
            detection.anomaly_feature_contributions.map((f) => ({
              featureName: f.feature_name,
              featureValue: f.feature_value,
              contributionScore: f.contribution_score?.toNumber() ?? null,
              rank: f.rank,
            })),
        });
        if (!generated) throw new Error('No model response');
        const text = [
          generated.summary,
          ...generated.observations.map((s) => `Observation: ${s}`),
          ...generated.recommendedActions.map((s) => `Recommended action: ${s}`),
        ].join('\n\n');
        // Lease and compare-and-set protect manual regeneration and stale workers.
        await prisma.$executeRaw`UPDATE anomaly_alerts a SET explanation_text=${text},explanation_generated_at=clock_timestamp()
          WHERE a.id=${alert.id}::uuid AND a.explanation_text=${alert.explanation_text}
            AND a.explanation_generated_at=${alert.explanation_generated_at}
            AND EXISTS(SELECT 1 FROM detection_jobs j WHERE j.id=${job.id}::uuid AND j.lease_token=${claimed.token}::uuid AND j.status='PROCESSING' AND j.lease_until>now())`;
      }
      await prisma.$executeRaw`UPDATE detection_jobs SET status='COMPLETED',lease_token=NULL,lease_until=NULL,
        result=${JSON.stringify({ explanation: env.OLLAMA_ENABLED ? 'GENERATED_OR_SUPERSEDED' : 'FALLBACK_DISABLED' })}::jsonb,updated_at=now()
        WHERE id=${job.id}::uuid AND lease_token=${claimed.token}::uuid AND lease_until>now() AND engine_version=${pipelineEngine}`;
    } catch {
      // Fallback already exists on the alert; retry enrichment, never detection.
      await detectionJobsRepository.fail(claimed.token);
    }
  }
}

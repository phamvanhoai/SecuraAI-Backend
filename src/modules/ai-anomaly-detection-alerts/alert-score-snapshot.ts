import { z } from 'zod';

const snapshotSchema = z.object({
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  updatedAt: z.string().optional(),
  features: z.array(
    z.object({
      featureName: z.string(),
      featureValue: z.string().nullable(),
      contributionScore: z.number().nullable(),
      rank: z.number().nullable(),
    }),
  ),
});

/** A peak is a read projection; original detections and their scores remain immutable. */
export function peakSnapshot(
  features: readonly { feature_name: string; feature_value: string | null }[],
  originalScore: number,
) {
  let peak: z.infer<typeof snapshotSchema> | null = null;
  for (const feature of features) {
    if (feature.feature_name !== 'alert_score_update' || !feature.feature_value) continue;
    try {
      const parsed = snapshotSchema.safeParse(JSON.parse(feature.feature_value) as unknown);
      if (parsed.success && parsed.data.score > (peak?.score ?? originalScore)) peak = parsed.data;
    } catch {
      /* Ignore malformed historical metadata, never fabricate a score. */
    }
  }
  return peak;
}

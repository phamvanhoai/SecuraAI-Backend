import { z } from 'zod';

export const runAnomalyDetectionBodySchema = z
  .object({
    lookbackHours: z.number().int().min(1).max(720).default(24),
    maxEvents: z.number().int().min(1).max(500).default(100),
  })
  .strict();

export type RunAnomalyDetectionBody = z.infer<typeof runAnomalyDetectionBodySchema>;

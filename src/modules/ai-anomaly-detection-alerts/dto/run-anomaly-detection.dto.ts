import { z } from 'zod';

// Validate and bound one manual detection batch.
export const runAnomalyDetectionBodySchema = z
  .object({
    // Kept for API compatibility; manual runs currently process ALL_PENDING.
    lookbackHours: z.number().int().min(1).max(720).default(24),
    maxEvents: z.number().int().min(1).max(500).default(100),
  })
  .strict();

// Infer the TypeScript input used by the controller and service from the schema.
export type RunAnomalyDetectionBody = z.infer<typeof runAnomalyDetectionBodySchema>;

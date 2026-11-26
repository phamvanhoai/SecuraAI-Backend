import { z } from 'zod';

// Validate the body for a manual detection run.
// Defaults keep the batch bounded when the client omits these fields.
export const runAnomalyDetectionBodySchema = z
  .object({
    lookbackHours: z.number().int().min(1).max(720).default(24),
    maxEvents: z.number().int().min(1).max(500).default(100),
  })
  .strict();

// Infer the TypeScript input used by the controller and service from the schema.
export type RunAnomalyDetectionBody = z.infer<typeof runAnomalyDetectionBodySchema>;

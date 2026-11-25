import { z } from 'zod';

// Define the request body for configuring the detection threshold.
// The API uses a value from 0.5 (50%) to 1 (100%).
export const configureDetectionThresholdSchema = z.object({
  threshold: z.number().min(0.5).max(1),
});

export type ConfigureDetectionThreshold = z.infer<typeof configureDetectionThresholdSchema>;

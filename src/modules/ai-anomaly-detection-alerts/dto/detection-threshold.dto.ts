import { z } from 'zod';

export const configureDetectionThresholdSchema = z.object({
  threshold: z.number().min(0.5).max(1),
});

export type ConfigureDetectionThreshold = z.infer<typeof configureDetectionThresholdSchema>;

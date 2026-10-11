import { z } from 'zod';

export const recordEradicationActionSchema = z
  .object({
    description: z.string().trim().min(10).max(4000),
    performedAt: z.iso.datetime(),
  })
  .strict();
export type RecordEradicationAction = z.infer<typeof recordEradicationActionSchema>;

export const eradicationHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();

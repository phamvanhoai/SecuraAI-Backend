import { z } from 'zod';

export const recordRecoveryActionSchema = z
  .object({
    description: z.string().trim().min(10).max(4000),
    performedAt: z.iso.datetime(),
  })
  .strict();
export type RecordRecoveryAction = z.infer<typeof recordRecoveryActionSchema>;

export const recoveryHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();

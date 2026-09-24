import { z } from 'zod';

export const createMfaRecoveryRequestBodySchema = z.object({
  challengeToken: z.string().min(32).max(256),
}).strict();

export const listMfaRecoveryRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const mfaRecoveryRequestParamsSchema = z.object({ requestId: z.uuid() });

export const decideMfaRecoveryRequestBodySchema = z.object({
  reason: z.string().trim().min(10).max(2000),
}).strict();

export type CreateMfaRecoveryRequestBody = z.infer<typeof createMfaRecoveryRequestBodySchema>;
export type ListMfaRecoveryRequestsQuery = z.infer<typeof listMfaRecoveryRequestsQuerySchema>;
export type DecideMfaRecoveryRequestBody = z.infer<typeof decideMfaRecoveryRequestBodySchema>;

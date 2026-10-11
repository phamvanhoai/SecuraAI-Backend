import { z } from 'zod';

export const riskRegisterStatuses = [
  'open',
  'under_treatment',
  'accepted',
  'closed',
  'archived',
] as const;
export const riskRatings = ['low', 'medium', 'high', 'critical'] as const;

export const listRiskRegisterQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    q: z.string().trim().min(1).max(100).optional(),
    status: z.enum(riskRegisterStatuses).optional(),
    riskRating: z.enum(riskRatings).optional(),
    ownerId: z.uuid().optional(),
    assetId: z.uuid().optional(),
    reviewFrom: z.iso.date().optional(),
    reviewTo: z.iso.date().optional(),
    sortBy: z.enum(['riskCode', 'title', 'reviewDate', 'updatedAt']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(({ reviewFrom, reviewTo }) => !reviewFrom || !reviewTo || reviewFrom <= reviewTo, {
    message: 'reviewFrom must be on or before reviewTo',
    path: ['reviewTo'],
  });

export const riskIdParamsSchema = z.object({ riskId: z.uuid() });
export type ListRiskRegisterQuery = z.infer<typeof listRiskRegisterQuerySchema>;

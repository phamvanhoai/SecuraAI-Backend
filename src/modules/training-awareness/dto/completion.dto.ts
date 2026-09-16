import { z } from 'zod';

export const completionCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(100).default(''),
});

export const completionCampaignParamsSchema = z.object({
  campaignId: z.string().uuid(),
});

export const completionEnrollmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'assigned', 'in_progress', 'completed', 'overdue']).default('all'),
});

export type CompletionCampaignsQuery = z.infer<typeof completionCampaignsQuerySchema>;
export type CompletionEnrollmentsQuery = z.infer<typeof completionEnrollmentsQuerySchema>;

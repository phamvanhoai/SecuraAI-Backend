import { z } from 'zod';

export const aiAlertIdParamsSchema = z.object({ alertId: z.uuid() }).strict();

export const createAiAlertFeedbackSchema = z
  .object({
    feedbackLabel: z.enum(['confirmed_incident', 'false_positive', 'needs_review']),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();

export const listAiAlertFeedbackQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type CreateAiAlertFeedback = z.infer<typeof createAiAlertFeedbackSchema>;
export type ListAiAlertFeedbackQuery = z.infer<typeof listAiAlertFeedbackQuerySchema>;

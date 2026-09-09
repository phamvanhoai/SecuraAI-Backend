import { z } from 'zod';

export const alertFeedbackLabels = ['confirmed_incident', 'false_positive', 'needs_review'] as const;

export const alertIdParamsSchema = z
  .object({ alertId: z.string().uuid() })
  .strict();

export const evaluateAlertReliabilityBodySchema = z
  .object({
    feedbackLabel: z.enum(alertFeedbackLabels),
    comment: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type EvaluateAlertReliabilityBody = z.infer<typeof evaluateAlertReliabilityBodySchema>;

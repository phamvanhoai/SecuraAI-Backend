import { z } from 'zod';
export const reportIncidentBodySchema = z
  .object({
    title: z.string().trim().min(5).max(255),
    description: z.string().trim().min(20).max(10_000),
    category: z.enum([
      'phishing',
      'malware',
      'account_compromise',
      'data_exposure',
      'network',
      'physical',
      'other',
    ]),
    occurredAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine((value) => !value.occurredAt || new Date(value.occurredAt) <= new Date(), {
    path: ['occurredAt'],
    message: 'Occurrence time cannot be in the future',
  });
export const myIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export const incidentParamsSchema = z.object({ incidentId: z.uuid() });
export const incidentSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const classifyIncidentBodySchema = z
  .object({
    severity: incidentSeveritySchema,
    rationale: z.string().trim().min(10).max(2000),
  })
  .strict();
export const assignIncidentBodySchema = z
  .object({
    assigneeUserId: z.uuid(),
    note: z.string().trim().min(10).max(2000),
  })
  .strict();
export const updateIncidentProgressBodySchema = z
  .object({
    status: z.enum(['in_progress', 'escalated', 'resolved', 'closed']),
    note: z.string().trim().min(10).max(5000),
  })
  .strict();
export const classificationQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  severity: incidentSeveritySchema.optional(),
  status: z
    .enum(['reported', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed'])
    .optional(),
  classification: z.enum(['unclassified', 'classified']).optional(),
});
export type ReportIncidentInput = z.infer<typeof reportIncidentBodySchema>;
export type MyIncidentsQuery = z.infer<typeof myIncidentsQuerySchema>;
export type ClassifyIncidentInput = z.infer<typeof classifyIncidentBodySchema>;
export type AssignIncidentInput = z.infer<typeof assignIncidentBodySchema>;
export type UpdateIncidentProgressInput = z.infer<typeof updateIncidentProgressBodySchema>;
export type ClassificationQueueQuery = z.infer<typeof classificationQueueQuerySchema>;

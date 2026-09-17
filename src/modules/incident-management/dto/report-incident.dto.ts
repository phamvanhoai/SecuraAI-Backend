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
export type ReportIncidentInput = z.infer<typeof reportIncidentBodySchema>;
export type MyIncidentsQuery = z.infer<typeof myIncidentsQuerySchema>;

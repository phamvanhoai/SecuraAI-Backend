import { z } from 'zod';

const filtersSchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    eventType: z.string().trim().min(1).max(150).optional(),
    source: z.string().trim().min(1).max(100).optional(),
    actor: z.string().trim().min(1).max(100).optional(),
    status: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'From timestamp must not be after to timestamp',
    path: ['to'],
  });

export const exportInvestigationLogsSchema = z
  .object({
  format: z.enum(['CSV', 'JSON', 'XLSX', 'PDF']),
    scope: z.enum(['SELECTED', 'FILTERED']),
    selectedIds: z.array(z.uuid()).max(1000).default([]),
    filters: filtersSchema.default({}),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === 'SELECTED' && value.selectedIds.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['selectedIds'],
        message: 'Select at least one log',
      });
  });

export type ExportInvestigationLogsInput = z.infer<typeof exportInvestigationLogsSchema>;

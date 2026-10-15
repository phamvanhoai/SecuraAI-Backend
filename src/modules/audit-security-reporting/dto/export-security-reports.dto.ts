import { z } from 'zod';

export const reportTypeEnum = z.enum(['RISK', 'INCIDENT', 'SECURITY_POSTURE']);
export type ReportType = z.infer<typeof reportTypeEnum>;

export const reportFormatEnum = z.enum(['EXCEL', 'PDF', 'CSV']);
export type ReportFormat = z.infer<typeof reportFormatEnum>;

export const exportReportRequestSchema = z.object({
  reportType: reportTypeEnum,
  format: reportFormatEnum.default('EXCEL'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'startDate must follow YYYY-MM-DD format')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, 'endDate must follow YYYY-MM-DD format')
    .optional(),
  severity: z.string().trim().max(50).optional(),
  status: z.string().trim().max(50).optional(),
});
export type ExportReportRequest = z.infer<typeof exportReportRequestSchema>;

export const listExportReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  reportType: z.string().optional(),
  status: z.enum(['REQUESTED', 'GENERATING', 'COMPLETED', 'FAILED']).optional(),
  sortBy: z.enum(['createdAt', 'generatedAt', 'reportType', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ListExportReportsQuery = z.infer<typeof listExportReportsQuerySchema>;

export const revokeExportReportSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, 'Reason must be at least 5 characters')
    .max(500, 'Reason cannot exceed 500 characters'),
});
export type RevokeExportReportRequest = z.infer<typeof revokeExportReportSchema>;

export const reportExportItemSchema = z.object({
  id: z.string().uuid(),
  reportType: z.string(),
  format: z.string(),
  status: z.enum(['REQUESTED', 'GENERATING', 'COMPLETED', 'FAILED']),
  storageUri: z.string().nullable(),
  requestedBy: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    role: z.string(),
  }),
  filters: z.record(z.string(), z.unknown()).nullable(),
  summary: z
    .object({
      recordCount: z.number().int().nonnegative(),
      period: z.string().optional(),
      highlights: z.array(z.string()).optional(),
    })
    .optional(),
  downloadUrl: z.string(),
  isRevoked: z.boolean().default(false),
  revokedAt: z.string().nullable().optional(),
  revokedBy: z.string().nullable().optional(),
  revocationReason: z.string().nullable().optional(),
  generatedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ReportExportItem = z.infer<typeof reportExportItemSchema>;

export const listExportReportsResponseSchema = z.object({
  items: z.array(reportExportItemSchema),
  pagination: z.object({
    page: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
});
export type ListExportReportsResponse = z.infer<typeof listExportReportsResponseSchema>;

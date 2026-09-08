import { z } from 'zod';

export const logSourceTypes = [
  'application',
  'system',
  'authentication',
  'network',
  'firewall',
  'external',
] as const;

export const logSourceStatuses = ['active', 'inactive', 'error'] as const;
export const logFormats = ['json', 'syslog', 'cef', 'text'] as const;

const fieldMappingSchema = z
  .object({
    timestamp: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,4}$/)
      .optional(),
    eventType: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,4}$/)
      .optional(),
    severity: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,4}$/)
      .optional(),
    sourceIp: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,4}$/)
      .optional(),
    destinationIp: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,4}$/)
      .optional(),
    externalEventId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,4}$/)
      .optional(),
  })
  .strict();

export const logSourceConfigurationSchema = z
  .object({
    format: z.enum(logFormats),
    timezone: z.string().trim().min(1).max(100).default('UTC'),
    collectRawPayload: z.boolean().default(true),
    pollingIntervalSeconds: z.number().int().min(1).max(86_400).optional(),
    fieldMapping: fieldMappingSchema.optional(),
  })
  .strict();

export const createLogSourceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    sourceType: z.enum(logSourceTypes),
    assetId: z.uuid().nullable().optional(),
    integrationId: z.uuid().nullable().optional(),
    configuration: logSourceConfigurationSchema,
    status: z.enum(logSourceStatuses).default('active'),
  })
  .strict();

export const updateLogSourceBodySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    assetId: z.uuid().nullable().optional(),
    integrationId: z.uuid().nullable().optional(),
    configuration: logSourceConfigurationSchema.optional(),
    status: z.enum(logSourceStatuses).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const logSourceParamsSchema = z.object({ logSourceId: z.uuid() }).strict();

export const listLogSourcesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    sourceType: z.enum(logSourceTypes).optional(),
    status: z.enum(logSourceStatuses).optional(),
    assetId: z.uuid().optional(),
    sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'lastReceivedAt']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

export type CreateLogSourceBody = z.infer<typeof createLogSourceBodySchema>;
export type UpdateLogSourceBody = z.infer<typeof updateLogSourceBodySchema>;
export type ListLogSourcesQuery = z.infer<typeof listLogSourcesQuerySchema>;

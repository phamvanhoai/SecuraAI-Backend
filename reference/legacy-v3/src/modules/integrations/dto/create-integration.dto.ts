import { z } from 'zod';

export const integrationTypeEnum = z.enum(['siem', 'firewall', 'log_source', 'api']);

export const createIntegrationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150, 'Name cannot exceed 150 characters'),
  integrationType: integrationTypeEnum,
  baseUrl: z
    .string()
    .trim()
    .url('Invalid URL format')
    .optional()
    .nullable()
    .transform((val) => (val && val.length > 0 ? val : null)),
  configuration: z.record(z.string(), z.unknown()).optional().nullable(),
});

export type CreateIntegrationDto = z.infer<typeof createIntegrationSchema>;
export type IntegrationType = z.infer<typeof integrationTypeEnum>;

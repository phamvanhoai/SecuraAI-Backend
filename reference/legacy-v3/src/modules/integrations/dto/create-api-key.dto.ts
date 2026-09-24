import { z } from 'zod';

export const createApiKeySchema = z.object({
  keyName: z
    .string()
    .trim()
    .min(1, 'Key name is required')
    .max(100, 'Key name must not exceed 100 characters'),
  secret: z
    .string()
    .trim()
    .min(1, 'Secret must not be empty')
    .max(1000, 'Secret must not exceed 1000 characters')
    .optional(),
  expiresAt: z
    .string()
    .datetime({ message: 'Invalid ISO date-time format for expiresAt' })
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: 'Expiration date must be in the future (expiresAt > currentTime)',
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional().default(true),
});

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

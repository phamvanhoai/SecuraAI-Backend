import { z } from 'zod';

export const updateApiKeySchema = z.object({
  keyName: z
    .string()
    .trim()
    .min(1, 'Key name must not be empty')
    .max(100, 'Key name must not exceed 100 characters')
    .optional(),
  expiresAt: z
    .string()
    .datetime({ message: 'Invalid ISO date-time format for expiresAt' })
    .refine((val) => new Date(val).getTime() > Date.now(), {
      message: 'Expiration date must be in the future',
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateApiKeyDto = z.infer<typeof updateApiKeySchema>;

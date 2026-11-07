import { z } from 'zod';

export const updateIntegrationApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Key name cannot be empty').max(255).optional(),
  keyName: z.string().trim().min(1, 'Key name cannot be empty').max(255).optional(),
  scopes: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one authorized scope is required')
    .optional(),
  expiresAt: z
    .string({ message: 'Expiration date must be a valid ISO-8601 datetime string' })
    .trim()
    .min(1, 'Expiration date is required. Non-expiring API keys are not permitted')
    .datetime({ message: 'Expiration date must be a valid ISO-8601 datetime string' })
    .refine(
      (val) => new Date(val).getTime() > Date.now(),
      { message: 'Expiration date must be in the future' },
    )
    .nullable()
    .refine(
      (val) => val !== null,
      { message: 'Expiration date is required. Non-expiring API keys are not permitted' },
    )
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateIntegrationApiKeyInput = z.infer<typeof updateIntegrationApiKeySchema>;

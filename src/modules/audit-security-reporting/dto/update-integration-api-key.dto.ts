import { z } from 'zod';

export const updateIntegrationApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Key name must not be empty').max(255).optional(),
  keyName: z.string().trim().min(1, 'Key name must not be empty').max(255).optional(),
  scopes: z
    .array(z.string().trim().min(1))
    .min(1, 'At least one authorized scope is required')
    .optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateIntegrationApiKeyInput = z.infer<typeof updateIntegrationApiKeySchema>;

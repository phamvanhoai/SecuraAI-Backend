import { z } from 'zod';

export const rotateApiKeySchema = z.object({
  secret: z
    .string()
    .trim()
    .min(1, 'Secret must not be empty')
    .max(1000, 'Secret must not exceed 1000 characters')
    .optional(),
});

export type RotateApiKeyDto = z.infer<typeof rotateApiKeySchema>;

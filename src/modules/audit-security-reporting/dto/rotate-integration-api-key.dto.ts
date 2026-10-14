import { z } from 'zod';
import type { CreatedIntegrationApiKeyResponseDto } from './create-integration-api-key.dto.js';

export const rotateIntegrationApiKeySchema = z
  .object({
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    secret: z
      .string()
      .trim()
      .max(1000, 'Secret must not exceed 1000 characters')
      .optional(),
  })
  .optional()
  .default({});

export type RotateIntegrationApiKeyDto = z.infer<typeof rotateIntegrationApiKeySchema>;
export type RotateIntegrationApiKeyInput = z.input<typeof rotateIntegrationApiKeySchema>;

export interface RotatedIntegrationApiKeyResponseDto extends CreatedIntegrationApiKeyResponseDto {
  replacedKeyId: string;
}

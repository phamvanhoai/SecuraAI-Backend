import { z } from 'zod';
import type { IntegrationApiKeyItemDto } from './list-integration-api-keys.dto.js';

export const revokeIntegrationApiKeySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(500, 'Reason must not exceed 500 characters')
      .optional(),
  })
  .optional()
  .default({});

export type RevokeIntegrationApiKeyDto = z.infer<typeof revokeIntegrationApiKeySchema>;
export type RevokeIntegrationApiKeyInput = z.input<typeof revokeIntegrationApiKeySchema>;

export type RevokedIntegrationApiKeyResponseDto = IntegrationApiKeyItemDto;

import { z } from 'zod';

export const apiKeyStatusEnum = z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ROTATED']);
export type ApiKeyStatus = z.infer<typeof apiKeyStatusEnum>;

export const listIntegrationApiKeysQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: apiKeyStatusEnum.optional(),
  isActive: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional()),
  eventSourceId: z.string().uuid().optional(),
  integrationId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'expiresAt', 'lastUsedAt', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListIntegrationApiKeysQueryDto = z.infer<typeof listIntegrationApiKeysQuerySchema>;

export const integrationApiKeyParamsSchema = z.object({
  id: z.string().uuid(),
});

export type IntegrationApiKeyParamsDto = z.infer<typeof integrationApiKeyParamsSchema>;

export const integrationApiKeyItemDtoSchema = z.object({
  id: z.string().uuid(),
  eventSourceId: z.string().uuid().nullable(),
  integrationId: z.string().uuid().nullable(),
  name: z.string(),
  keyName: z.string(),
  keyPrefix: z.string(),
  keyFingerprint: z.string(),
  maskedKey: z.string(),
  status: apiKeyStatusEnum,
  isActive: z.boolean(),
  scopes: z.array(z.string()),
  expiresAt: z.coerce.date().nullable(),
  lastUsedAt: z.coerce.date().nullable(),
  lastUsedIp: z.string().nullable(),
  creator: z
    .object({
      id: z.string().uuid(),
      fullName: z.string(),
      email: z.string(),
      username: z.string(),
    })
    .nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
  rotatedAt: z.coerce.date().nullable(),
  revokedAt: z.coerce.date().nullable(),
  eventSource: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      sourceType: z.string(),
    })
    .nullable(),
});

export type IntegrationApiKeyItemDto = z.infer<typeof integrationApiKeyItemDtoSchema>;

export const listIntegrationApiKeysResponseSchema = z.object({
  items: z.array(integrationApiKeyItemDtoSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
});

export type ListIntegrationApiKeysResponseDto = z.infer<typeof listIntegrationApiKeysResponseSchema>;

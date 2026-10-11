import { z } from 'zod';
import { apiKeyStatusEnum } from './list-integration-api-keys.dto.js';

export const getIntegrationApiKeyDetailParamsSchema = z.object({
  keyId: z.string().uuid(),
});

export type GetIntegrationApiKeyDetailParamsDto = z.infer<
  typeof getIntegrationApiKeyDetailParamsSchema
>;

export const getIntegrationSourceApiKeyDetailParamsSchema = z.object({
  id: z.string().uuid(),
  keyId: z.string().uuid(),
});

export type GetIntegrationSourceApiKeyDetailParamsDto = z.infer<
  typeof getIntegrationSourceApiKeyDetailParamsSchema
>;

export const integrationApiKeyDetailUserSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  username: z.string(),
});

export const integrationApiKeyDetailDtoSchema = z.object({
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
  creator: integrationApiKeyDetailUserSchema.nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
  rotatedAt: z.coerce.date().nullable(),
  revokedAt: z.coerce.date().nullable(),
  revokedBy: z.string().uuid().nullable(),
  revoker: integrationApiKeyDetailUserSchema.nullable(),
  replacementKeyId: z.string().uuid().nullable(),
  replacementKey: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      keyPrefix: z.string(),
      status: z.string(),
    })
    .nullable(),
  eventSource: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      sourceType: z.string(),
    })
    .nullable(),
  usage: z.object({
    lastUsedAt: z.coerce.date().nullable(),
    lastUsedIp: z.string().nullable(),
    totalAuditEvents: z.number().int().min(0),
    isUsed: z.boolean(),
  }),
});

export type IntegrationApiKeyDetailDto = z.infer<typeof integrationApiKeyDetailDtoSchema>;

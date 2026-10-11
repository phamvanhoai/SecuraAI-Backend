import { z } from 'zod';
import { apiKeyStatusEnum, type ApiKeyStatus } from './list-integration-api-keys.dto.js';

export const standardApiKeyScopes = [
  'events:ingest',
  'events:read',
  'alerts:read',
  'assets:read',
  'compliance:read',
] as const;

export type StandardApiKeyScope = (typeof standardApiKeyScopes)[number];

export const createIntegrationApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'API key name is required')
    .max(255, 'API key name must not exceed 255 characters')
    .optional(),
  keyName: z
    .string()
    .trim()
    .min(1, 'Key name is required')
    .max(255, 'Key name must not exceed 255 characters')
    .optional(),
  eventSourceId: z
    .string()
    .uuid('Event source ID must be a valid UUID')
    .nullable()
    .optional(),
  integrationId: z
    .string()
    .uuid('Integration ID must be a valid UUID')
    .nullable()
    .optional(),
  scopes: z
    .array(
      z
        .string()
        .trim()
        .min(1, 'Scope code cannot be empty')
        .max(100, 'Scope code must not exceed 100 characters'),
    )
    .min(1, 'At least one authorized scope is required')
    .default(['events:ingest']),
  expiresAt: z
    .string()
    .datetime({ message: 'Expiration date must be a valid ISO-8601 datetime string' })
    .nullable()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return new Date(val).getTime() > Date.now();
      },
      {
        message: 'Expiration date must be in the future',
      },
    ),
  isActive: z.boolean().optional().default(true),
  status: apiKeyStatusEnum.optional().default('ACTIVE'),
}).refine(
  (data) => Boolean(data.name?.trim() || data.keyName?.trim()),
  {
    message: 'API key name is required',
    path: ['name'],
  },
);

export type CreateIntegrationApiKeyDto = z.infer<typeof createIntegrationApiKeySchema>;
export type CreateIntegrationApiKeyInput = z.input<typeof createIntegrationApiKeySchema>;

export interface CreatedIntegrationApiKeyResponseDto {
  id: string;
  name: string;
  keyName: string;
  keyPrefix: string;
  keyFingerprint: string;
  maskedKey: string;
  secret: string;
  status: ApiKeyStatus;
  isActive: boolean;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  eventSourceId: string | null;
  integrationId: string | null;
  createdBy: string;
  creator: {
    id: string;
    fullName: string | null;
    email: string;
    username: string;
  } | null;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  eventSource?: {
    id: string;
    name: string;
    sourceType: string;
  } | null;
}


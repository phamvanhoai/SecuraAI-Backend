import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { integrationApiKeysRepository } from './integration-api-keys.repository.js';
import type {
  IntegrationApiKeyItemDto,
  ListIntegrationApiKeysQueryDto,
  ListIntegrationApiKeysResponseDto,
} from './dto/list-integration-api-keys.dto.js';
import {
  createIntegrationApiKeySchema,
  type CreateIntegrationApiKeyInput,
  type CreatedIntegrationApiKeyResponseDto,
} from './dto/create-integration-api-key.dto.js';

export const integrationApiKeysService = {
  async listApiKeys(
    userId: string,
    query: ListIntegrationApiKeysQueryDto,
  ): Promise<ListIntegrationApiKeysResponseDto> {
    await requireAuthorizedAdmin(userId);

    const targetSourceId = query.eventSourceId || query.integrationId;
    if (targetSourceId) {
      const source = await integrationApiKeysRepository.findEventSourceById(targetSourceId);
      if (!source) {
        throw new AppError(404, 'NOT_FOUND', 'Event source / integration not found');
      }
    }

    const [records, totalItems] = await Promise.all([
      integrationApiKeysRepository.findMany(query),
      integrationApiKeysRepository.count(query),
    ]);

    const items: IntegrationApiKeyItemDto[] = records.map((record) =>
      mapToApiKeyItemDto(record),
    );

    const totalPages = Math.ceil(totalItems / query.limit) || 1;

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
      },
    };
  },

  async listApiKeysForIntegration(
    userId: string,
    integrationId: string,
    query: Omit<ListIntegrationApiKeysQueryDto, 'integrationId' | 'eventSourceId'>,
  ): Promise<IntegrationApiKeyItemDto[]> {
    await requireAuthorizedAdmin(userId);

    const source = await integrationApiKeysRepository.findEventSourceById(integrationId);
    if (!source) {
      throw new AppError(404, 'NOT_FOUND', 'Event source / integration not found');
    }

    const fullQuery: ListIntegrationApiKeysQueryDto = {
      ...query,
      eventSourceId: integrationId,
      integrationId,
    };

    const records = await integrationApiKeysRepository.findMany(fullQuery);
    return records.map((record) => mapToApiKeyItemDto(record));
  },

  async createApiKey(
    userId: string,
    rawInput: CreateIntegrationApiKeyInput,
    contextIntegrationId?: string,
  ): Promise<CreatedIntegrationApiKeyResponseDto> {
    await requireAuthorizedAdmin(userId);

    const input = createIntegrationApiKeySchema.parse(rawInput);
    const name = (input.name?.trim() || input.keyName?.trim())!;
    const targetSourceId = contextIntegrationId || input.eventSourceId || input.integrationId || null;

    if (targetSourceId) {
      const source = await integrationApiKeysRepository.findEventSourceById(targetSourceId);
      if (!source) {
        throw new AppError(404, 'NOT_FOUND', 'Event source / integration not found');
      }
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'BAD_REQUEST', 'Expiration date must be in the future');
    }

    // Generate random secret token with collision-resistant prefix
    const rawRandom = randomBytes(24).toString('hex');
    const secret = `sec_live_${rawRandom}`;
    const keyPrefix = `sec_live_${rawRandom.slice(0, 10)}`;
    const secretHash = createHash('sha256').update(secret).digest('hex');

    const scopes = Array.from(new Set(input.scopes.map((s) => s.trim()).filter(Boolean)));
    if (scopes.length === 0) {
      throw new AppError(400, 'BAD_REQUEST', 'At least one authorized scope is required');
    }

    const createdRecord = await integrationApiKeysRepository.createApiKey({
      name,
      eventSourceId: targetSourceId,
      keyPrefix,
      secretHash,
      status: input.status ?? 'ACTIVE',
      expiresAt,
      createdBy: userId,
      scopes,
    });

    const itemDto = mapToApiKeyItemDto(createdRecord);

    return {
      ...itemDto,
      secret,
    };
  },
};

async function requireAuthorizedAdmin(userId: string): Promise<void> {
  const user = await integrationApiKeysRepository.findUserById(userId);
  if (!user || user.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or inactive user account');
  }

  if (user.role !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Only administrators can view integration API keys');
  }
}

type DbApiKeyRecord = Awaited<ReturnType<typeof integrationApiKeysRepository.findMany>>[number];

function mapToApiKeyItemDto(record: DbApiKeyRecord): IntegrationApiKeyItemDto {
  const now = new Date();
  const isExpired = record.expires_at !== null && record.expires_at <= now;
  const isRevoked = record.status === 'REVOKED';
  const isRotated = record.status === 'ROTATED';

  let effectiveStatus = record.status;
  if (record.status === 'ACTIVE' && isExpired) {
    effectiveStatus = 'EXPIRED';
  }

  const isActive = record.status === 'ACTIVE' && !isExpired && !isRevoked && !isRotated;
  const maskedKey = `${record.key_prefix}...****`;

  return {
    id: record.id,
    eventSourceId: record.event_source_id,
    integrationId: record.event_source_id,
    name: record.name,
    keyName: record.name,
    keyPrefix: record.key_prefix,
    keyFingerprint: maskedKey,
    maskedKey,
    status: effectiveStatus,
    isActive,
    scopes: record.api_key_scopes.map((s) => s.scope_code),
    expiresAt: record.expires_at,
    lastUsedAt: record.last_used_at,
    lastUsedIp: record.last_used_ip,
    creator: record.users_integration_api_keys_created_byTousers
      ? {
          id: record.users_integration_api_keys_created_byTousers.id,
          fullName: record.users_integration_api_keys_created_byTousers.full_name,
          email: record.users_integration_api_keys_created_byTousers.email,
          username: record.users_integration_api_keys_created_byTousers.username,
        }
      : null,
    createdBy: record.created_by,
    createdAt: record.created_at,
    rotatedAt: record.rotated_at,
    revokedAt: record.revoked_at,
    eventSource: record.event_sources
      ? {
          id: record.event_sources.id,
          name: record.event_sources.name,
          sourceType: record.event_sources.source_type,
        }
      : null,
  };
}

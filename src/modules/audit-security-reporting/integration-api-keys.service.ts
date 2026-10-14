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
import type { IntegrationApiKeyDetailDto } from './dto/get-integration-api-key-detail.dto.js';
import {
  updateIntegrationApiKeySchema,
  type UpdateIntegrationApiKeyInput,
} from './dto/update-integration-api-key.dto.js';
import {
  rotateIntegrationApiKeySchema,
  type RotateIntegrationApiKeyInput,
  type RotatedIntegrationApiKeyResponseDto,
} from './dto/rotate-integration-api-key.dto.js';
import {
  revokeIntegrationApiKeySchema,
  type RevokeIntegrationApiKeyInput,
} from './dto/revoke-integration-api-key.dto.js';
import type { api_key_status } from '@prisma/client';

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

  async getApiKeyDetail(
    userId: string,
    keyId: string,
    contextIntegrationId?: string,
  ): Promise<IntegrationApiKeyDetailDto> {
    await requireAuthorizedAdmin(userId);

    const record = await integrationApiKeysRepository.findById(keyId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Integration API key not found');
    }

    if (
      contextIntegrationId &&
      record.event_source_id &&
      record.event_source_id !== contextIntegrationId
    ) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Integration API key not found for the specified integration',
      );
    }

    const totalAuditEvents = await integrationApiKeysRepository.countAuditLogsForApiKey(keyId);

    return mapToApiKeyDetailDto(record, totalAuditEvents);
  },

  async updateApiKey(
    userId: string,
    keyId: string,
    rawInput: UpdateIntegrationApiKeyInput,
    contextIntegrationId?: string,
  ): Promise<IntegrationApiKeyItemDto> {
    await requireAuthorizedAdmin(userId);

    const input = updateIntegrationApiKeySchema.parse(rawInput);
    const existing = await integrationApiKeysRepository.findById(keyId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Integration API key not found');
    }

    if (
      contextIntegrationId &&
      existing.event_source_id &&
      existing.event_source_id !== contextIntegrationId
    ) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Integration API key not found for the specified integration',
      );
    }

    if (existing.status === 'REVOKED') {
      throw new AppError(400, 'BAD_REQUEST', 'Cannot modify a revoked API key');
    }

    let nextExpiresAt: Date | null | undefined;
    if (input.expiresAt !== undefined) {
      if (input.expiresAt === null) {
        nextExpiresAt = null;
      } else {
        const parsedDate = new Date(input.expiresAt);
        if (isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
          throw new AppError(400, 'BAD_REQUEST', 'Expiration date must be in the future');
        }
        nextExpiresAt = parsedDate;
      }
    }

    let nextScopes: string[] | undefined;
    if (input.scopes !== undefined) {
      const sanitized = Array.from(new Set(input.scopes.map((s) => s.trim()).filter(Boolean)));
      if (sanitized.length === 0) {
        throw new AppError(400, 'BAD_REQUEST', 'At least one authorized scope is required');
      }
      nextScopes = sanitized;
    }

    const nextName = (input.name?.trim() || input.keyName?.trim()) || undefined;

    let nextStatus: api_key_status | undefined;
    if (nextExpiresAt !== undefined && existing.status === 'ACTIVE') {
      nextStatus = 'ACTIVE';
    }

    const updated = await integrationApiKeysRepository.updateApiKey(keyId, {
      name: nextName,
      expiresAt: nextExpiresAt,
      status: nextStatus,
      scopes: nextScopes,
      updatedBy: userId,
    });

    return mapToApiKeyItemDto(updated);
  },

  async rotateApiKey(
    userId: string,
    keyId: string,
    rawInput?: RotateIntegrationApiKeyInput,
    contextIntegrationId?: string,
  ): Promise<RotatedIntegrationApiKeyResponseDto> {
    await requireAuthorizedAdmin(userId);

    const input = rotateIntegrationApiKeySchema.parse(rawInput ?? {});

    const existing = await integrationApiKeysRepository.findById(keyId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Integration API key not found');
    }

    if (
      contextIntegrationId &&
      existing.event_source_id &&
      existing.event_source_id !== contextIntegrationId
    ) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Integration API key not found for the specified integration',
      );
    }

    if (existing.status === 'REVOKED') {
      throw new AppError(400, 'BAD_REQUEST', 'Cannot rotate a revoked API key');
    }

    if (existing.status === 'ROTATED') {
      throw new AppError(400, 'BAD_REQUEST', 'Cannot rotate an already rotated API key');
    }

    let nextExpiresAt: Date | null = existing.expires_at;
    if (input.expiresAt !== undefined) {
      nextExpiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }

    if (nextExpiresAt && nextExpiresAt.getTime() <= Date.now()) {
      throw new AppError(400, 'BAD_REQUEST', 'Expiration date must be in the future');
    }

    // Generate cryptographically secure replacement secret token
    const rawRandom = randomBytes(24).toString('hex');
    const secret = `sec_live_${rawRandom}`;
    const keyPrefix = `sec_live_${rawRandom.slice(0, 10)}`;
    const secretHash = createHash('sha256').update(secret).digest('hex');

    const scopes = existing.api_key_scopes.map((s) => s.scope_code);
    const effectiveScopes = scopes.length > 0 ? scopes : ['events:ingest'];

    const replacementRecord = await integrationApiKeysRepository.rotateApiKey({
      existingKeyId: keyId,
      name: existing.name,
      eventSourceId: existing.event_source_id,
      keyPrefix,
      secretHash,
      status: 'ACTIVE',
      expiresAt: nextExpiresAt,
      rotatedBy: userId,
      scopes: effectiveScopes,
    });

    const itemDto = mapToApiKeyItemDto(replacementRecord);

    return {
      ...itemDto,
      secret,
      replacedKeyId: keyId,
    };
  },

  async revokeApiKey(
    userId: string,
    keyId: string,
    rawInput?: RevokeIntegrationApiKeyInput,
    contextIntegrationId?: string,
  ): Promise<IntegrationApiKeyItemDto> {
    await requireAuthorizedAdmin(userId);

    const input = revokeIntegrationApiKeySchema.parse(rawInput ?? {});

    const existing = await integrationApiKeysRepository.findById(keyId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Integration API key not found');
    }

    if (
      contextIntegrationId &&
      existing.event_source_id &&
      existing.event_source_id !== contextIntegrationId
    ) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Integration API key not found for the specified integration',
      );
    }

    if (existing.status === 'REVOKED') {
      throw new AppError(400, 'BAD_REQUEST', 'API key is already revoked');
    }

    const revokedRecord = await integrationApiKeysRepository.revokeApiKey(
      keyId,
      userId,
      input.reason,
    );

    return mapToApiKeyItemDto(revokedRecord);
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

type DbApiKeyDetailRecord = NonNullable<
  Awaited<ReturnType<typeof integrationApiKeysRepository.findById>>
>;

function mapToApiKeyDetailDto(
  record: DbApiKeyDetailRecord,
  totalAuditEvents: number,
): IntegrationApiKeyDetailDto {
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
    revokedBy: record.revoked_by,
    revoker: record.users_integration_api_keys_revoked_byTousers
      ? {
          id: record.users_integration_api_keys_revoked_byTousers.id,
          fullName: record.users_integration_api_keys_revoked_byTousers.full_name,
          email: record.users_integration_api_keys_revoked_byTousers.email,
          username: record.users_integration_api_keys_revoked_byTousers.username,
        }
      : null,
    replacementKeyId: record.replacement_key_id,
    replacementKey: record.integration_api_keys
      ? {
          id: record.integration_api_keys.id,
          name: record.integration_api_keys.name,
          keyPrefix: record.integration_api_keys.key_prefix,
          status: record.integration_api_keys.status,
        }
      : null,
    eventSource: record.event_sources
      ? {
          id: record.event_sources.id,
          name: record.event_sources.name,
          sourceType: record.event_sources.source_type,
        }
      : null,
    usage: {
      lastUsedAt: record.last_used_at,
      lastUsedIp: record.last_used_ip,
      totalAuditEvents,
      isUsed: Boolean(record.last_used_at || totalAuditEvents > 0),
    },
  };
}

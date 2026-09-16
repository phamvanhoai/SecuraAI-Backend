import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { executeSafeHttpRequest, validateExternalUrl } from '../../common/utils/ssrf-validator.js';
import { getNextCronRunDate } from '../../common/utils/cron.js';
import { decryptSecret, encryptSecret } from '../../common/utils/encryption.js';
import { resolveConnector } from './connectors/index.js';
import { integrationsRepository } from './integrations.repository.js';
import {
  toIntegrationResponseDto,
  toSyncScheduleResponseDto,
  toSyncJobResponseDto,
  toIntegrationLogResponseDto,
  toApiKeyResponseDto,
  toApiKeyCreatedResponseDto,
  type IntegrationResponseDto,
  type SyncScheduleResponseDto,
  type SyncJobResponseDto,
  type ApiKeyResponseDto,
  type ApiKeyCreatedResponseDto,
} from './integrations.mapper.js';
import type {
  CreateIntegrationDto,
  QueryIntegrationsDto,
  TestConnectionDto,
  UpdateIntegrationDto,
  CreateSyncScheduleDto,
  UpdateSyncScheduleDto,
  QuerySyncJobsDto,
  QueryIntegrationLogsDto,
  CreateApiKeyDto,
  UpdateApiKeyDto,
  RotateApiKeyDto,
  QueryApiKeysDto,
  QueryConnectionMonitoringDto,
  BatchConnectionCheckDto,
  ConnectionStatusSummaryDto,
  BatchConnectionCheckResultDto,
  IntegrationConnectionStatusDto,
  SingleCheckProbeResult,
  ConnectionLogEntryDto,
  FailingIntegrationDto,
} from './dto/index.js';

function generateSecretFingerprint(secret: string): string {
  if (secret.length <= 8) {
    return `sec_...${secret.slice(-2)}`;
  }
  return `sec_...${secret.slice(-4)}`;
}


export type TestConnectionResult = {
  connected: boolean;
  statusCode: number | null;
  latencyMs: number;
  message: string;
  provider?: string | undefined;
  details?: Record<string, unknown> | undefined;
};

export type TriggerSyncOptions = {
  syncScheduleId?: string | null | undefined;
  isScheduledTrigger?: boolean | undefined;
};

async function probeSingleIntegration(
  integration: { integration_id: string; name: string; base_url: string | null; configuration?: unknown; status: string },
  timeoutMs?: number,
): Promise<SingleCheckProbeResult> {
  const integrationId = integration.integration_id;
  if (!integration.base_url) {
    return {
      integrationId,
      name: integration.name,
      connected: false,
      statusCode: null,
      latencyMs: 0,
      message: 'No base URL configured for this integration',
    };
  }

  const connector = resolveConnector({
    integration_id: integration.integration_id,
    name: integration.name,
    integration_type: 'siem',
    base_url: integration.base_url,
    configuration: integration.configuration,
    status: integration.status,
  });
  const result = await connector.testConnection(
    {
      integration_id: integration.integration_id,
      name: integration.name,
      integration_type: 'siem',
      base_url: integration.base_url,
      configuration: integration.configuration,
      status: integration.status,
    },
    timeoutMs !== undefined ? { timeoutMs } : undefined,
  );

  if (result.connected) {
    await integrationsRepository.update(integrationId, {
      status: 'active',
      last_connected_at: new Date(),
    });

    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'info',
      message: result.message,
      details: {
        action: 'CONNECTION_CHECK',
        latencyMs: result.latencyMs,
        httpStatus: result.statusCode ?? 200,
        success: true,
        provider: result.provider,
        verifySslWarning: result.verifySslWarning ?? false,
        ...(result.details ? { details: result.details as Prisma.InputJsonValue } : {}),
      },
    });

    return {
      integrationId,
      name: integration.name,
      connected: true,
      statusCode: result.statusCode ?? 200,
      latencyMs: result.latencyMs,
      message: result.message,
      provider: result.provider,
      details: result.details,
    };
  }

  await integrationsRepository.update(integrationId, {
    status: 'error',
  });

  await integrationsRepository.createLog({
    integration_id: integrationId,
    level: 'warn',
    message: result.message,
    details: {
      action: 'CONNECTION_CHECK',
      latencyMs: result.latencyMs,
      httpStatus: result.statusCode ?? null,
      success: false,
      provider: result.provider,
      verifySslWarning: result.verifySslWarning ?? false,
      errorCode: result.statusCode ? `HTTP_${result.statusCode}` : 'CONNECTION_FAILED',
    },
  });

  return {
    integrationId,
    name: integration.name,
    connected: false,
    statusCode: result.statusCode ?? null,
    latencyMs: result.latencyMs,
    message: result.message,
    provider: result.provider,
  };
}

export const integrationsService = {
  // -------------------------------------------------------------
  // Integrations Core Methods
  // -------------------------------------------------------------
  async createIntegration(dto: CreateIntegrationDto, userId?: string): Promise<IntegrationResponseDto> {
    if (dto.baseUrl) {
      await validateExternalUrl(dto.baseUrl);
    }

    const created = await integrationsRepository.create({
      name: dto.name,
      integration_type: dto.integrationType,
      base_url: dto.baseUrl ?? null,
      configuration: (dto.configuration ?? {}) as Prisma.InputJsonValue,
      created_by_user_id: userId ?? null,
    });

    await integrationsRepository.createLog({
      integration_id: created.integration_id,
      level: 'info',
      message: `Integration "${created.name}" created successfully`,
    });

    return toIntegrationResponseDto(created);
  },

  async listIntegrations(query: QueryIntegrationsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      integrationsRepository.findMany({
        skip,
        take: limit,
        search: query.search,
        type: query.type,
        status: query.status,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      integrationsRepository.count({
        search: query.search,
        type: query.type,
        status: query.status,
      }),
    ]);

    return {
      items: items.map(toIntegrationResponseDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  },

  async getIntegrationById(id: string): Promise<IntegrationResponseDto> {
    const integration = await integrationsRepository.findById(id);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }
    return toIntegrationResponseDto(integration);
  },

  async updateIntegration(id: string, dto: UpdateIntegrationDto): Promise<IntegrationResponseDto> {
    const existing = await integrationsRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }

    if (dto.baseUrl !== undefined && dto.baseUrl !== null && dto.baseUrl !== existing.base_url) {
      await validateExternalUrl(dto.baseUrl);
    }

    const updated = await integrationsRepository.update(id, {
      name: dto.name,
      base_url: dto.baseUrl,
      configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      status: dto.status,
    });

    await integrationsRepository.createLog({
      integration_id: id,
      level: 'info',
      message: 'Integration configuration updated',
    });

    return toIntegrationResponseDto(updated);
  },

  async testConnection(id: string, dto: TestConnectionDto): Promise<TestConnectionResult> {
    const integration = await integrationsRepository.findById(id);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }

    if (!integration.base_url) {
      throw new AppError(
        400,
        'NO_ENDPOINT_CONFIGURED',
        'Cannot test connection: No base URL configured for this integration',
      );
    }

    const probeResult = await probeSingleIntegration(integration, dto.timeoutMs);
    return {
      connected: probeResult.connected,
      statusCode: probeResult.statusCode,
      latencyMs: probeResult.latencyMs,
      message: probeResult.message,
    };
  },

  // -------------------------------------------------------------
  // Connection Monitoring Service Methods
  // -------------------------------------------------------------
  async checkAllConnections(dto: BatchConnectionCheckDto): Promise<BatchConnectionCheckResultDto> {
    const timeoutMs = dto.timeoutMs ? Math.min(Math.max(dto.timeoutMs, 1000), 10000) : 5000;
    const integrations = await integrationsRepository.findConfiguredIntegrationsForProbe(dto.integrationIds);

    if (integrations.length === 0) {
      return {
        totalTested: 0,
        successful: 0,
        failed: 0,
        results: [],
      };
    }

    // Limit concurrency to 3 simultaneous probes
    const concurrency = 3;
    const results: SingleCheckProbeResult[] = [];

    for (let i = 0; i < integrations.length; i += concurrency) {
      const chunk = integrations.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map((item) => probeSingleIntegration(item, timeoutMs)),
      );
      results.push(...chunkResults);
    }

    const successful = results.filter((r) => r.connected).length;
    const failed = results.filter((r) => !r.connected).length;

    return {
      totalTested: results.length,
      successful,
      failed,
      results,
    };
  },

  async getConnectionStatusSummary(
    query: QueryConnectionMonitoringDto = { timeWindow: '24h' },
  ): Promise<ConnectionStatusSummaryDto> {
    const timeWindow = query.timeWindow ?? '24h';
    const hours = timeWindow === '7d' ? 7 * 24 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [integrations, rawLogs] = await integrationsRepository.findConnectionMonitoringData(since);

    const totalIntegrations = integrations.length;
    const activeCount = integrations.filter((i) => i.status === 'active').length;
    const errorCount = integrations.filter((i) => i.status === 'error').length;
    const inactiveCount = integrations.filter((i) => i.status === 'inactive').length;
    const pendingCount = integrations.filter((i) => i.status === 'pending').length;

    // Filter connection check logs
    const connectionLogs: ConnectionLogEntryDto[] = [];
    for (const log of rawLogs) {
      const details = log.details && typeof log.details === 'object' ? (log.details as Record<string, unknown>) : null;
      const isConnectionCheck =
        details?.action === 'CONNECTION_CHECK' ||
        log.message.includes('Connection check') ||
        log.message.includes('Connection test');

      if (isConnectionCheck) {
        const latencyMs = typeof details?.latencyMs === 'number' ? details.latencyMs : null;
        const httpStatus =
          typeof details?.httpStatus === 'number'
            ? details.httpStatus
            : typeof details?.statusCode === 'number'
              ? details.statusCode
              : null;
        const success = typeof details?.success === 'boolean' ? details.success : log.level === 'info';
        const errorCode = typeof details?.errorCode === 'string' ? details.errorCode : null;

        connectionLogs.push({
          id: log.integration_log_id,
          integrationId: log.integration_id,
          integrationName: (log as { integrations?: { name?: string } }).integrations?.name ?? undefined,
          level: log.level,
          message: log.message,
          createdAt: log.created_at,
          latencyMs,
          httpStatus,
          success,
          errorCode,
        });
      }
    }

    const checks24h = connectionLogs.length;
    const successfulChecks24h = connectionLogs.filter((l) => l.success === true).length;
    const failedChecks24h = connectionLogs.filter((l) => l.success === false).length;
    const availability24h = checks24h > 0 ? Number(((successfulChecks24h / checks24h) * 100).toFixed(1)) : null;

    const latencies = connectionLogs
      .filter((l) => l.success === true && typeof l.latencyMs === 'number')
      .map((l) => l.latencyMs as number);
    const averageLatency24h =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

    // Failing integrations list
    const failingIntegrations: FailingIntegrationDto[] = integrations
      .filter((i) => i.status === 'error')
      .map((i) => {
        const latestLog = connectionLogs.find((l) => l.integrationId === i.integration_id);
        return {
          id: i.integration_id,
          name: i.name,
          integrationType: i.integration_type,
          baseUrl: i.base_url,
          status: i.status,
          lastConnectedAt: i.last_connected_at,
          lastErrorMessage: latestLog?.message ?? null,
          lastCheckedAt: latestLog?.createdAt ?? null,
        };
      });

    return {
      totalIntegrations,
      activeCount,
      errorCount,
      inactiveCount,
      pendingCount,
      timeWindow,
      checks24h,
      successfulChecks24h,
      failedChecks24h,
      availability24h,
      averageLatency24h,
      failingIntegrations,
      recentLogs: connectionLogs.slice(0, 20),
    };
  },

  async getIntegrationConnectionStatus(
    id: string,
    query: QueryConnectionMonitoringDto = { timeWindow: '24h' },
  ): Promise<IntegrationConnectionStatusDto> {
    const integration = await integrationsRepository.findById(id);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }

    const timeWindow = query.timeWindow ?? '24h';
    const hours = timeWindow === '7d' ? 7 * 24 : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rawLogs = await integrationsRepository.findRecentConnectionLogs(id, 50);

    const connectionLogs: ConnectionLogEntryDto[] = [];
    for (const log of rawLogs) {
      const details = log.details && typeof log.details === 'object' ? (log.details as Record<string, unknown>) : null;
      const isConnectionCheck =
        details?.action === 'CONNECTION_CHECK' ||
        log.message.includes('Connection check') ||
        log.message.includes('Connection test');

      if (isConnectionCheck) {
        const latencyMs = typeof details?.latencyMs === 'number' ? details.latencyMs : null;
        const httpStatus =
          typeof details?.httpStatus === 'number'
            ? details.httpStatus
            : typeof details?.statusCode === 'number'
              ? details.statusCode
              : null;
        const success = typeof details?.success === 'boolean' ? details.success : log.level === 'info';
        const errorCode = typeof details?.errorCode === 'string' ? details.errorCode : null;

        connectionLogs.push({
          id: log.integration_log_id,
          integrationId: log.integration_id,
          level: log.level,
          message: log.message,
          createdAt: log.created_at,
          latencyMs,
          httpStatus,
          success,
          errorCode,
        });
      }
    }

    const logsInWindow = connectionLogs.filter((l) => l.createdAt >= since);
    const checks24h = logsInWindow.length;
    const successfulChecks24h = logsInWindow.filter((l) => l.success === true).length;
    const failedChecks24h = logsInWindow.filter((l) => l.success === false).length;
    const availability24h = checks24h > 0 ? Number(((successfulChecks24h / checks24h) * 100).toFixed(1)) : null;

    const latencies = logsInWindow
      .filter((l) => l.success === true && typeof l.latencyMs === 'number')
      .map((l) => l.latencyMs as number);
    const averageLatency24h =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

    return {
      id: integration.integration_id,
      name: integration.name,
      integrationType: integration.integration_type,
      baseUrl: integration.base_url,
      status: integration.status,
      lastConnectedAt: integration.last_connected_at,
      timeWindow,
      checks24h,
      successfulChecks24h,
      failedChecks24h,
      availability24h,
      averageLatency24h,
      recentLogs: connectionLogs.slice(0, 20),
    };
  },

  // -------------------------------------------------------------
  // Sync Schedules Methods (Child-Resource Scoped)
  // -------------------------------------------------------------
  async createSyncSchedule(
    integrationId: string,
    dto: CreateSyncScheduleDto,
  ): Promise<SyncScheduleResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const isActive = dto.isActive ?? true;
    const nextRunAt = isActive ? getNextCronRunDate(dto.scheduleExpression, new Date()) : null;

    const created = await integrationsRepository.createSyncSchedule({
      integration_id: integrationId,
      schedule_expression: dto.scheduleExpression,
      is_active: isActive,
      next_run_at: nextRunAt,
    });

    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'info',
      message: `Sync schedule created: "${created.schedule_expression}"`,
      details: { syncScheduleId: created.sync_schedule_id, nextRunAt: nextRunAt?.toISOString() },
    });

    return toSyncScheduleResponseDto(created);
  },

  async getSyncSchedules(
    integrationId: string,
    filter?: { isActive?: boolean },
  ): Promise<SyncScheduleResponseDto[]> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const schedules = await integrationsRepository.findSyncSchedulesByIntegrationId(integrationId, filter);
    return schedules.map(toSyncScheduleResponseDto);
  },

  async getSyncScheduleById(
    integrationId: string,
    scheduleId: string,
  ): Promise<SyncScheduleResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const schedule = await integrationsRepository.findSyncScheduleById(integrationId, scheduleId);
    if (!schedule) {
      throw new AppError(
        404,
        'SYNC_SCHEDULE_NOT_FOUND',
        `Sync schedule with ID "${scheduleId}" was not found on integration "${integrationId}"`,
      );
    }

    return toSyncScheduleResponseDto(schedule);
  },

  async updateSyncSchedule(
    integrationId: string,
    scheduleId: string,
    dto: UpdateSyncScheduleDto,
  ): Promise<SyncScheduleResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const existing = await integrationsRepository.findSyncScheduleById(integrationId, scheduleId);
    if (!existing) {
      throw new AppError(
        404,
        'SYNC_SCHEDULE_NOT_FOUND',
        `Sync schedule with ID "${scheduleId}" was not found on integration "${integrationId}"`,
      );
    }

    let nextRunAt: Date | null | undefined = undefined;
    const expression = dto.scheduleExpression ?? existing.schedule_expression;
    const active = dto.isActive !== undefined ? dto.isActive : existing.is_active;

    if (dto.scheduleExpression !== undefined || dto.isActive !== undefined) {
      nextRunAt = active ? getNextCronRunDate(expression, new Date()) : null;
    }

    const updated = await integrationsRepository.updateSyncSchedule(integrationId, scheduleId, {
      ...(dto.scheduleExpression !== undefined && { schedule_expression: dto.scheduleExpression }),
      ...(dto.isActive !== undefined && { is_active: dto.isActive }),
      ...(nextRunAt !== undefined && { next_run_at: nextRunAt }),
    });

    if (!updated) {
      throw new AppError(404, 'SYNC_SCHEDULE_NOT_FOUND', `Sync schedule with ID "${scheduleId}" not found`);
    }

    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'info',
      message: `Sync schedule "${scheduleId}" updated`,
      details: { nextRunAt: nextRunAt?.toISOString() },
    });

    return toSyncScheduleResponseDto(updated);
  },

  async deleteSyncSchedule(integrationId: string, scheduleId: string): Promise<void> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const deleted = await integrationsRepository.deleteSyncSchedule(integrationId, scheduleId);
    if (!deleted) {
      throw new AppError(
        404,
        'SYNC_SCHEDULE_NOT_FOUND',
        `Sync schedule with ID "${scheduleId}" was not found on integration "${integrationId}"`,
      );
    }

    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'info',
      message: `Sync schedule "${scheduleId}" deleted`,
    });
  },

  // -------------------------------------------------------------
  // Integration API Keys Methods
  // -------------------------------------------------------------
  async createApiKey(
    integrationId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const plaintextSecret = dto.secret?.trim() || `sec_${randomBytes(24).toString('base64url')}`;
    const secretEncrypted = encryptSecret(plaintextSecret);
    const keyFingerprint = generateSecretFingerprint(plaintextSecret);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const isActive = dto.isActive !== undefined ? dto.isActive : true;

    const created = await integrationsRepository.createApiKey({
      integration_id: integrationId,
      key_name: dto.keyName.trim(),
      secret_encrypted: secretEncrypted,
      key_fingerprint: keyFingerprint,
      expires_at: expiresAt,
      is_active: isActive,
    });

    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'info',
      message: 'API_KEY_CREATED',
      details: { apiKeyId: created.integration_api_key_id, keyName: created.key_name },
    });

    return toApiKeyCreatedResponseDto(created, plaintextSecret);
  },

  async listApiKeys(
    integrationId: string,
    query?: QueryApiKeysDto,
  ): Promise<ApiKeyResponseDto[]> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const keys = await integrationsRepository.findApiKeysByIntegrationId(integrationId, query);
    return keys.map(toApiKeyResponseDto);
  },

  async getApiKeyById(
    integrationId: string,
    apiKeyId: string,
  ): Promise<ApiKeyResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const key = await integrationsRepository.findApiKeyById(integrationId, apiKeyId);
    if (!key) {
      throw new AppError(
        404,
        'API_KEY_NOT_FOUND',
        `API key with ID "${apiKeyId}" was not found on integration "${integrationId}"`,
      );
    }

    return toApiKeyResponseDto(key);
  },

  async updateApiKey(
    integrationId: string,
    apiKeyId: string,
    dto: UpdateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const existing = await integrationsRepository.findApiKeyById(integrationId, apiKeyId);
    if (!existing) {
      throw new AppError(
        404,
        'API_KEY_NOT_FOUND',
        `API key with ID "${apiKeyId}" was not found on integration "${integrationId}"`,
      );
    }

    const expiresAt = dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : undefined;
    const isReactivating = dto.isActive === true && !existing.is_active;

    const updated = await integrationsRepository.updateApiKey(integrationId, apiKeyId, {
      ...(dto.keyName !== undefined && { key_name: dto.keyName.trim() }),
      ...(expiresAt !== undefined && { expires_at: expiresAt }),
      ...(dto.isActive !== undefined && { is_active: dto.isActive }),
    });

    const eventMessage = isReactivating ? 'API_KEY_REACTIVATED' : 'API_KEY_UPDATED';
    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'info',
      message: eventMessage,
      details: {
        apiKeyId,
        keyName: updated.key_name,
        isActive: updated.is_active,
      },
    });

    return toApiKeyResponseDto(updated);
  },

  async rotateApiKey(
    integrationId: string,
    apiKeyId: string,
    dto: RotateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const existing = await integrationsRepository.findApiKeyById(integrationId, apiKeyId);
    if (!existing) {
      throw new AppError(
        404,
        'API_KEY_NOT_FOUND',
        `API key with ID "${apiKeyId}" was not found on integration "${integrationId}"`,
      );
    }

    const newPlaintextSecret = dto.secret?.trim() || `sec_${randomBytes(24).toString('base64url')}`;
    const newSecretEncrypted = encryptSecret(newPlaintextSecret);
    const newKeyFingerprint = generateSecretFingerprint(newPlaintextSecret);

    const updated = await integrationsRepository.updateApiKey(integrationId, apiKeyId, {
      secret_encrypted: newSecretEncrypted,
      key_fingerprint: newKeyFingerprint,
    });

    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'info',
      message: 'API_KEY_ROTATED',
      details: {
        apiKeyId,
        keyName: updated.key_name,
        keyFingerprint: newKeyFingerprint,
      },
    });

    return toApiKeyCreatedResponseDto(updated, newPlaintextSecret);
  },

  async revokeApiKey(
    integrationId: string,
    apiKeyId: string,
  ): Promise<ApiKeyResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const existing = await integrationsRepository.findApiKeyById(integrationId, apiKeyId);
    if (!existing) {
      throw new AppError(
        404,
        'API_KEY_NOT_FOUND',
        `API key with ID "${apiKeyId}" was not found on integration "${integrationId}"`,
      );
    }

    const revoked = await integrationsRepository.revokeApiKey(integrationId, apiKeyId);

    await integrationsRepository.createLog({
      integration_id: integrationId,
      level: 'warn',
      message: 'API_KEY_REVOKED',
      details: {
        apiKeyId,
        keyName: existing.key_name,
      },
    });

    return toApiKeyResponseDto(revoked);
  },

  // -------------------------------------------------------------
  // Sync Job Execution & History Methods
  // -------------------------------------------------------------
  async triggerSyncJob(
    integrationId: string,
    options?: TriggerSyncOptions,
  ): Promise<SyncJobResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    if (!integration.base_url) {
      throw new AppError(
        400,
        'NO_ENDPOINT_CONFIGURED',
        'Cannot sync logs: No base URL configured for this integration',
      );
    }

    // Layer 1 & 2 Concurrency Guard inside repository transaction
    const runningJob = await integrationsRepository.createRunningSyncJobWithConcurrencyGuard({
      integrationId,
      syncScheduleId: options?.syncScheduleId,
    });

    await integrationsRepository.createLog({
      integration_id: integrationId,
      sync_job_id: runningJob.sync_job_id,
      level: 'info',
      message: 'SYNC_STARTED',
      details: { jobId: runningJob.sync_job_id, syncScheduleId: options?.syncScheduleId ?? null },
    });

    const startTime = Date.now();

    // Prepare credentials from active API keys (UC13.3)
    const activeKey = await integrationsRepository.findLatestActiveApiKey(integrationId);
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (activeKey) {
      const plaintextSecret = decryptSecret(activeKey.secret_encrypted);
      const config = (integration.configuration ?? {}) as Record<string, unknown>;
      const authType = typeof config['authType'] === 'string' ? config['authType'] : 'bearer';
      const headerName = typeof config['headerName'] === 'string' ? config['headerName'] : 'X-API-Key';

      if (authType === 'api_key') {
        headers[headerName] = plaintextSecret;
      } else {
        headers['Authorization'] = `Bearer ${plaintextSecret}`;
      }
    }

    try {
      const config = (integration.configuration ?? {}) as Record<string, unknown>;
      const subPath = typeof config['logsPath'] === 'string' ? config['logsPath'] : '';
      const targetUrl = subPath ? new URL(subPath, integration.base_url).toString() : integration.base_url;

      const response = await executeSafeHttpRequest({
        url: targetUrl,
        method: 'GET',
        headers,
        timeoutMs: 15000,
        rejectUnauthorized: config['verifySsl'] !== false,
      });

      const durationMs = Date.now() - startTime;

      if (response.ok) {
        let recordsProcessed = 0;
        const recordsFailed = 0;

        if (response.body) {
          if (Array.isArray(response.body)) {
            recordsProcessed = response.body.length;
          } else if (
            typeof response.body === 'object' &&
            response.body !== null &&
            'events' in response.body &&
            Array.isArray(response.body['events'])
          ) {
            recordsProcessed = (response.body['events'] as unknown[]).length;
          } else if (
            typeof response.body === 'object' &&
            response.body !== null &&
            'logs' in response.body &&
            Array.isArray(response.body['logs'])
          ) {
            recordsProcessed = (response.body['logs'] as unknown[]).length;
          } else {
            recordsProcessed = 1;
          }
        } else {
          recordsProcessed = 0;
        }

        const completedJob = await integrationsRepository.updateSyncJob(runningJob.sync_job_id, {
          status: 'completed',
          records_processed: recordsProcessed,
          records_failed: recordsFailed,
          completed_at: new Date(),
        });

        await integrationsRepository.update(integrationId, {
          status: 'active',
          last_connected_at: new Date(),
        });

        await integrationsRepository.createLog({
          integration_id: integrationId,
          sync_job_id: runningJob.sync_job_id,
          level: 'info',
          message: 'SYNC_COMPLETED',
          details: {
            jobId: runningJob.sync_job_id,
            durationMs,
            recordsProcessed,
            recordsFailed,
          },
        });

        // If triggered by scheduler, advance schedule timestamps
        if (options?.isScheduledTrigger && options.syncScheduleId) {
          const schedule = await integrationsRepository.findSyncScheduleById(
            integrationId,
            options.syncScheduleId,
          );
          if (schedule) {
            const nextRun = getNextCronRunDate(schedule.schedule_expression, new Date());
            await integrationsRepository.updateSyncSchedule(integrationId, options.syncScheduleId, {
              last_run_at: new Date(),
              next_run_at: nextRun,
            });
          }
        }

        return toSyncJobResponseDto(completedJob);
      }

      // Non-2xx response from external SIEM
      const errorMsg = `External SIEM returned HTTP ${response.statusCode}: ${response.statusText || 'Non-success'}`;

      const failedJob = await integrationsRepository.updateSyncJob(runningJob.sync_job_id, {
        status: 'failed',
        records_processed: 0,
        records_failed: 0,
        completed_at: new Date(),
        error_message: errorMsg,
      });

      await integrationsRepository.update(integrationId, {
        status: 'error',
      });

      await integrationsRepository.createLog({
        integration_id: integrationId,
        sync_job_id: runningJob.sync_job_id,
        level: 'error',
        message: 'SYNC_FAILED',
        details: {
          jobId: runningJob.sync_job_id,
          durationMs,
          error: errorMsg,
        },
      });

      if (options?.isScheduledTrigger && options.syncScheduleId) {
        const schedule = await integrationsRepository.findSyncScheduleById(
          integrationId,
          options.syncScheduleId,
        );
        if (schedule) {
          const nextRun = getNextCronRunDate(schedule.schedule_expression, new Date());
          await integrationsRepository.updateSyncSchedule(integrationId, options.syncScheduleId, {
            last_run_at: new Date(),
            next_run_at: nextRun,
          });
        }
      }

      return toSyncJobResponseDto(failedJob);
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : 'Unknown network/socket failure';

      const failedJob = await integrationsRepository.updateSyncJob(runningJob.sync_job_id, {
        status: 'failed',
        records_processed: 0,
        records_failed: 0,
        completed_at: new Date(),
        error_message: errorMsg,
      });

      await integrationsRepository.update(integrationId, {
        status: 'error',
      });

      await integrationsRepository.createLog({
        integration_id: integrationId,
        sync_job_id: runningJob.sync_job_id,
        level: 'error',
        message: 'SYNC_FAILED',
        details: {
          jobId: runningJob.sync_job_id,
          durationMs,
          error: errorMsg,
        },
      });

      if (options?.isScheduledTrigger && options.syncScheduleId) {
        const schedule = await integrationsRepository.findSyncScheduleById(
          integrationId,
          options.syncScheduleId,
        );
        if (schedule) {
          const nextRun = getNextCronRunDate(schedule.schedule_expression, new Date());
          await integrationsRepository.updateSyncSchedule(integrationId, options.syncScheduleId, {
            last_run_at: new Date(),
            next_run_at: nextRun,
          });
        }
      }

      return toSyncJobResponseDto(failedJob);
    }
  },

  async listSyncJobs(integrationId: string, query: QuerySyncJobsDto) {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      integrationId,
      status: query.status,
      syncScheduleId: query.syncScheduleId,
    };

    const [items, total] = await Promise.all([
      integrationsRepository.findSyncJobs({
        ...filter,
        skip,
        take: limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      integrationsRepository.countSyncJobs(filter),
    ]);

    return {
      items: items.map(toSyncJobResponseDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getSyncJobById(integrationId: string, jobId: string): Promise<SyncJobResponseDto> {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const job = await integrationsRepository.findSyncJobById(integrationId, jobId);
    if (!job) {
      throw new AppError(
        404,
        'SYNC_JOB_NOT_FOUND',
        `Sync job with ID "${jobId}" was not found on integration "${integrationId}"`,
      );
    }

    return toSyncJobResponseDto(job);
  },

  async listIntegrationLogs(integrationId: string, query: QueryIntegrationLogsDto) {
    const integration = await integrationsRepository.findById(integrationId);
    if (!integration) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${integrationId}" was not found`);
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      integrationId,
      level: query.level,
      syncJobId: query.syncJobId,
    };

    const [items, total] = await Promise.all([
      integrationsRepository.findIntegrationLogs({
        ...filter,
        skip,
        take: limit,
      }),
      integrationsRepository.countIntegrationLogs(filter),
    ]);

    return {
      items: items.map(toIntegrationLogResponseDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  // -------------------------------------------------------------
  // Scheduled Worker Runner
  // -------------------------------------------------------------
  async processDueSyncSchedules(): Promise<void> {
    const dueSchedules = await integrationsRepository.findDueSyncSchedules(new Date());

    for (const schedule of dueSchedules) {
      try {
        await integrationsService.triggerSyncJob(schedule.integration_id, {
          syncScheduleId: schedule.sync_schedule_id,
          isScheduledTrigger: true,
        });
      } catch (err: unknown) {
        if (err instanceof AppError && err.statusCode === 409) {
          // 409 Conflict: another manual/scheduled job is currently running or locked.
          // Rule: Keep last_run_at unchanged; advance next_run_at to avoid continuous spam.
          const nextRun = getNextCronRunDate(schedule.schedule_expression, new Date());
          await integrationsRepository.updateSyncSchedule(
            schedule.integration_id,
            schedule.sync_schedule_id,
            { next_run_at: nextRun },
          );

          await integrationsRepository.createLog({
            integration_id: schedule.integration_id,
            level: 'warn',
            message: 'Scheduled sync skipped due to concurrent execution (409 Conflict); advanced to next interval',
            details: { nextRunAt: nextRun.toISOString() },
          });
        } else {
          // Advance next_run_at for other errors so scheduler does not get stuck
          try {
            const nextRun = getNextCronRunDate(schedule.schedule_expression, new Date());
            await integrationsRepository.updateSyncSchedule(
              schedule.integration_id,
              schedule.sync_schedule_id,
              { next_run_at: nextRun },
            );
          } catch {
            // Ignore if schedule expression calculation errors out
          }
        }
      }
    }
  },
};

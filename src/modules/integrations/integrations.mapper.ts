export type IntegrationResponseDto = {
  id: string;
  name: string;
  integrationType: string;
  baseUrl: string | null;
  configuration: unknown;
  status: string;
  lastConnectedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RawIntegrationRecord = {
  integration_id: string;
  name: string;
  integration_type: string;
  base_url: string | null;
  configuration: unknown;
  status: string;
  last_connected_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString();
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toIsoDateRequired(value: Date | string | null | undefined): string {
  const formatted = toIsoDate(value);
  return formatted ?? new Date().toISOString();
}

function sanitizeConfiguration(config: unknown): unknown {
  if (!config || typeof config !== 'object') return config;
  const clone = { ...(config as Record<string, unknown>) };
  const sensitiveKeys = ['password', 'secret', 'apiKey', 'token', 'jwtToken', 'clientSecret'];
  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.some((s) => s.toLowerCase() === key.toLowerCase())) {
      clone[key] = '********';
    }
  }
  return clone;
}

export function toIntegrationResponseDto(record: RawIntegrationRecord): IntegrationResponseDto {
  return {
    id: record.integration_id,
    name: record.name,
    integrationType: record.integration_type,
    baseUrl: record.base_url,
    configuration: sanitizeConfiguration(record.configuration),
    status: record.status,
    lastConnectedAt: toIsoDate(record.last_connected_at),
    createdByUserId: record.created_by_user_id,
    createdAt: toIsoDateRequired(record.created_at),
    updatedAt: toIsoDateRequired(record.updated_at),
  };
}

export type SyncScheduleResponseDto = {
  id: string;
  integrationId: string;
  scheduleExpression: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RawSyncScheduleRecord = {
  sync_schedule_id: string;
  integration_id: string;
  schedule_expression: string;
  is_active: boolean;
  last_run_at: Date | null;
  next_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export function toSyncScheduleResponseDto(record: RawSyncScheduleRecord): SyncScheduleResponseDto {
  return {
    id: record.sync_schedule_id,
    integrationId: record.integration_id,
    scheduleExpression: record.schedule_expression,
    isActive: record.is_active,
    lastRunAt: toIsoDate(record.last_run_at),
    nextRunAt: toIsoDate(record.next_run_at),
    createdAt: toIsoDateRequired(record.created_at),
    updatedAt: toIsoDateRequired(record.updated_at),
  };
}

export type SyncJobResponseDto = {
  id: string;
  integrationId: string;
  syncScheduleId: string | null;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type RawSyncJobRecord = {
  sync_job_id: string;
  integration_id: string;
  sync_schedule_id: string | null;
  status: string;
  records_processed: number;
  records_failed: number;
  started_at: Date | null;
  completed_at: Date | null;
  error_message: string | null;
  created_at: Date;
};

export function toSyncJobResponseDto(record: RawSyncJobRecord): SyncJobResponseDto {
  return {
    id: record.sync_job_id,
    integrationId: record.integration_id,
    syncScheduleId: record.sync_schedule_id,
    status: record.status,
    recordsProcessed: record.records_processed,
    recordsFailed: record.records_failed,
    startedAt: toIsoDate(record.started_at),
    completedAt: toIsoDate(record.completed_at),
    errorMessage: record.error_message,
    createdAt: toIsoDateRequired(record.created_at),
  };
}

export type IntegrationLogResponseDto = {
  id: string;
  integrationId: string;
  syncJobId: string | null;
  level: string;
  message: string;
  details: unknown;
  createdAt: string;
};

export type RawIntegrationLogRecord = {
  integration_log_id: string;
  integration_id: string;
  sync_job_id: string | null;
  level: string;
  message: string;
  details: unknown;
  created_at: Date;
};

export function toIntegrationLogResponseDto(record: RawIntegrationLogRecord): IntegrationLogResponseDto {
  return {
    id: record.integration_log_id,
    integrationId: record.integration_id,
    syncJobId: record.sync_job_id,
    level: record.level,
    message: record.message,
    details: record.details,
    createdAt: toIsoDateRequired(record.created_at),
  };
}

export type ApiKeyStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

export type ApiKeyResponseDto = {
  id: string;
  integrationId: string;
  keyName: string;
  keyFingerprint: string | null;
  expiresAt: string | null;
  isActive: boolean;
  status: ApiKeyStatus;
  createdAt: string;
};

export type ApiKeyCreatedResponseDto = ApiKeyResponseDto & {
  secret: string;
};

export type RawApiKeyRecord = {
  integration_api_key_id: string;
  integration_id: string;
  key_name: string;
  key_fingerprint: string | null;
  expires_at: Date | null;
  is_active: boolean;
  created_at: Date;
};

export function deriveApiKeyStatus(isActive: boolean, expiresAt: Date | null): ApiKeyStatus {
  if (!isActive) {
    return 'INACTIVE';
  }
  if (expiresAt !== null && expiresAt.getTime() <= Date.now()) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}

export function toApiKeyResponseDto(record: RawApiKeyRecord): ApiKeyResponseDto {
  let status: ApiKeyStatus = 'ACTIVE';
  if (!record.is_active) {
    status = 'INACTIVE';
  } else if (record.expires_at && record.expires_at.getTime() < Date.now()) {
    status = 'EXPIRED';
  }

  return {
    id: record.integration_api_key_id,
    integrationId: record.integration_id,
    keyName: record.key_name,
    keyFingerprint: record.key_fingerprint,
    expiresAt: toIsoDate(record.expires_at),
    isActive: record.is_active,
    status,
    createdAt: toIsoDateRequired(record.created_at),
  };
}

export function toApiKeyCreatedResponseDto(
  record: RawApiKeyRecord,
  secret: string,
): ApiKeyCreatedResponseDto {
  return {
    ...toApiKeyResponseDto(record),
    secret,
  };
}

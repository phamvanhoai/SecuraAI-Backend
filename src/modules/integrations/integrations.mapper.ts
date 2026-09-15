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

export function toIntegrationResponseDto(record: RawIntegrationRecord): IntegrationResponseDto {
  return {
    id: record.integration_id,
    name: record.name,
    integrationType: record.integration_type,
    baseUrl: record.base_url,
    configuration: record.configuration,
    status: record.status,
    lastConnectedAt: record.last_connected_at ? record.last_connected_at.toISOString() : null,
    createdByUserId: record.created_by_user_id,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
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
    lastRunAt: record.last_run_at ? record.last_run_at.toISOString() : null,
    nextRunAt: record.next_run_at ? record.next_run_at.toISOString() : null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
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
    startedAt: record.started_at ? record.started_at.toISOString() : null,
    completedAt: record.completed_at ? record.completed_at.toISOString() : null,
    errorMessage: record.error_message,
    createdAt: record.created_at.toISOString(),
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
  integration?: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  syncJob?: {
    id: string;
    status: string;
    recordsProcessed: number;
    recordsFailed: number;
    errorMessage: string | null;
  };
};

export type RawIntegrationLogRecord = {
  integration_log_id: string;
  integration_id: string;
  sync_job_id: string | null;
  level: string;
  message: string;
  details: unknown;
  created_at: Date;
  integrations?: {
    integration_id: string;
    name: string;
    integration_type: string;
    status: string;
  } | null;
  sync_jobs?: {
    sync_job_id: string;
    status: string;
    records_processed: number;
    records_failed: number;
    error_message: string | null;
  } | null;
};

export function toIntegrationLogResponseDto(record: RawIntegrationLogRecord): IntegrationLogResponseDto {
  return {
    id: record.integration_log_id,
    integrationId: record.integration_id,
    syncJobId: record.sync_job_id,
    level: record.level,
    message: record.message,
    details: record.details,
    createdAt: record.created_at.toISOString(),
    ...(record.integrations && {
      integration: {
        id: record.integrations.integration_id,
        name: record.integrations.name,
        type: record.integrations.integration_type,
        status: record.integrations.status,
      },
    }),
    ...(record.sync_jobs && {
      syncJob: {
        id: record.sync_jobs.sync_job_id,
        status: record.sync_jobs.status,
        recordsProcessed: record.sync_jobs.records_processed,
        recordsFailed: record.sync_jobs.records_failed,
        errorMessage: record.sync_jobs.error_message,
      },
    }),
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
  return {
    id: record.integration_api_key_id,
    integrationId: record.integration_id,
    keyName: record.key_name,
    keyFingerprint: record.key_fingerprint,
    expiresAt: record.expires_at ? record.expires_at.toISOString() : null,
    isActive: record.is_active,
    status: deriveApiKeyStatus(record.is_active, record.expires_at),
    createdAt: record.created_at.toISOString(),
  };
}

export function toApiKeyCreatedResponseDto(
  record: RawApiKeyRecord,
  plaintextSecret: string,
): ApiKeyCreatedResponseDto {
  return {
    ...toApiKeyResponseDto(record),
    secret: plaintextSecret,
  };
}

export type IntegrationLogStatsResponseDto = {
  totalErrors: number;
  totalWarnings: number;
  failedJobsCount: number;
  affectedIntegrationsCount: number;
};

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
    createdAt: record.created_at.toISOString(),
  };
}

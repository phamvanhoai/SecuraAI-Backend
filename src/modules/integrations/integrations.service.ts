import { AppError } from '@/common/errors/app-error.js';
import { executeSafeHttpRequest, validateExternalUrl } from '@/common/utils/ssrf-validator.js';
import { getNextCronRunDate } from '@/common/utils/cron.js';
import { decryptSecret } from '@/common/utils/encryption.js';
import { integrationsRepository } from './integrations.repository.js';
import {
  toIntegrationResponseDto,
  toSyncScheduleResponseDto,
  toSyncJobResponseDto,
  toIntegrationLogResponseDto,
  type IntegrationResponseDto,
  type SyncScheduleResponseDto,
  type SyncJobResponseDto,
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
} from './dto/index.js';
import type { Prisma } from '@prisma/client';

export type TestConnectionResult = {
  connected: boolean;
  statusCode: number | null;
  latencyMs: number;
  message: string;
};

export type TriggerSyncOptions = {
  syncScheduleId?: string | null | undefined;
  isScheduledTrigger?: boolean | undefined;
};

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
      base_url: dto.baseUrl,
      configuration: dto.configuration as Prisma.InputJsonValue | undefined,
      created_by_user_id: userId,
      status: 'inactive',
    });

    await integrationsRepository.createLog({
      integration_id: created.integration_id,
      level: 'info',
      message: `Integration "${created.name}" created (${created.integration_type})`,
    });

    return toIntegrationResponseDto(created);
  },

  async listIntegrations(query: QueryIntegrationsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {
      type: query.type,
      status: query.status,
      search: query.search,
    };

    const [items, total] = await Promise.all([
      integrationsRepository.findMany({
        skip,
        take: limit,
        ...filter,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      }),
      integrationsRepository.count(filter),
    ]);

    return {
      items: items.map(toIntegrationResponseDto),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getIntegrationById(id: string): Promise<IntegrationResponseDto> {
    const record = await integrationsRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }
    return toIntegrationResponseDto(record);
  },

  async updateIntegration(id: string, dto: UpdateIntegrationDto): Promise<IntegrationResponseDto> {
    const existing = await integrationsRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'INTEGRATION_NOT_FOUND', `Integration with ID "${id}" was not found`);
    }

    if (dto.baseUrl) {
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

    const startTime = Date.now();
    try {
      const res = await executeSafeHttpRequest({
        url: integration.base_url,
        method: 'GET',
        timeoutMs: dto.timeoutMs,
      });

      if (res.ok) {
        await integrationsRepository.update(id, {
          status: 'active',
          last_connected_at: new Date(),
        });

        await integrationsRepository.createLog({
          integration_id: id,
          level: 'info',
          message: `Connection test succeeded with status ${res.statusCode} (${res.latencyMs}ms)`,
          details: { statusCode: res.statusCode, latencyMs: res.latencyMs },
        });

        return {
          connected: true,
          statusCode: res.statusCode,
          latencyMs: res.latencyMs,
          message: 'Connection established successfully',
        };
      }

      await integrationsRepository.update(id, {
        status: 'error',
      });

      await integrationsRepository.createLog({
        integration_id: id,
        level: 'warn',
        message: `Connection test returned HTTP ${res.statusCode} (${res.statusText})`,
        details: { statusCode: res.statusCode, latencyMs: res.latencyMs },
      });

      return {
        connected: false,
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        message: `External endpoint responded with HTTP status ${res.statusCode} (${res.statusText || 'Non-success'})`,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Unknown network or socket error';

      await integrationsRepository.update(id, {
        status: 'error',
      });

      await integrationsRepository.createLog({
        integration_id: id,
        level: 'error',
        message: `Connection test failed: ${errorMessage}`,
        details: { error: errorMessage, latencyMs },
      });

      return {
        connected: false,
        statusCode: null,
        latencyMs,
        message: `Connection test failed: ${errorMessage}`,
      };
    }
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

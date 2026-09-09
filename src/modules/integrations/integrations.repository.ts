import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';

const integrationSelect = {
  integration_id: true,
  name: true,
  integration_type: true,
  base_url: true,
  configuration: true,
  status: true,
  last_connected_at: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
} as const;

const syncScheduleSelect = {
  sync_schedule_id: true,
  integration_id: true,
  schedule_expression: true,
  is_active: true,
  last_run_at: true,
  next_run_at: true,
  created_at: true,
  updated_at: true,
} as const;

const syncJobSelect = {
  sync_job_id: true,
  integration_id: true,
  sync_schedule_id: true,
  status: true,
  records_processed: true,
  records_failed: true,
  started_at: true,
  completed_at: true,
  error_message: true,
  created_at: true,
} as const;

const integrationLogSelect = {
  integration_log_id: true,
  integration_id: true,
  sync_job_id: true,
  level: true,
  message: true,
  details: true,
  created_at: true,
} as const;

const activeApiKeySelect = {
  integration_api_key_id: true,
  integration_id: true,
  key_name: true,
  secret_encrypted: true,
  key_fingerprint: true,
  expires_at: true,
  is_active: true,
  created_at: true,
} as const;

export type CreateIntegrationRepoInput = {
  name: string;
  integration_type: string;
  base_url?: string | null | undefined;
  configuration?: Prisma.InputJsonValue | undefined;
  created_by_user_id?: string | null | undefined;
  status?: string | undefined;
};

export type UpdateIntegrationRepoInput = {
  name?: string | undefined;
  base_url?: string | null | undefined;
  configuration?: Prisma.InputJsonValue | undefined;
  status?: string | undefined;
  last_connected_at?: Date | undefined;
};

export type FindIntegrationsRepoInput = {
  skip: number;
  take: number;
  type?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
  sortBy?: 'createdAt' | 'name' | 'lastConnectedAt' | 'status';
  sortOrder?: 'asc' | 'desc';
};

export type CreateIntegrationLogRepoInput = {
  integration_id: string;
  sync_job_id?: string | null | undefined;
  level: string;
  message: string;
  details?: Prisma.InputJsonValue | undefined;
};

export type CreateSyncScheduleRepoInput = {
  integration_id: string;
  schedule_expression: string;
  is_active?: boolean;
  next_run_at?: Date | null;
};

export type UpdateSyncScheduleRepoInput = {
  schedule_expression?: string;
  is_active?: boolean;
  last_run_at?: Date | null;
  next_run_at?: Date | null;
};

export type FindSyncJobsRepoInput = {
  integrationId: string;
  skip: number;
  take: number;
  status?: string | undefined;
  syncScheduleId?: string | undefined;
  sortBy?: 'createdAt' | 'startedAt' | 'completedAt' | 'status';
  sortOrder?: 'asc' | 'desc';
};

export type FindIntegrationLogsRepoInput = {
  integrationId: string;
  skip: number;
  take: number;
  level?: string | undefined;
  syncJobId?: string | undefined;
};

export function buildWhereClause(params: {
  type?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
}): Prisma.integrationsWhereInput {
  const where: Prisma.integrationsWhereInput = {};
  if (params.type) where.integration_type = params.type;
  if (params.status) where.status = params.status;
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { base_url: { contains: params.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function buildOrderByClause(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Prisma.integrationsOrderByWithRelationInput {
  switch (sortBy) {
    case 'name':
      return { name: sortOrder };
    case 'lastConnectedAt':
      return { last_connected_at: sortOrder };
    case 'status':
      return { status: sortOrder };
    case 'createdAt':
    default:
      return { created_at: sortOrder };
  }
}

export const integrationsRepository = {
  create(data: CreateIntegrationRepoInput) {
    return prisma.integrations.create({
      data: {
        name: data.name,
        integration_type: data.integration_type,
        base_url: data.base_url ?? null,
        configuration: data.configuration ?? Prisma.DbNull,
        created_by_user_id: data.created_by_user_id ?? null,
        status: data.status ?? 'inactive',
      },
      select: integrationSelect,
    });
  },

  findById(id: string) {
    return prisma.integrations.findUnique({
      where: { integration_id: id },
      select: integrationSelect,
    });
  },

  findMany(params: FindIntegrationsRepoInput) {
    const where = buildWhereClause(params);
    const orderBy = buildOrderByClause(params.sortBy, params.sortOrder);

    return prisma.integrations.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy,
      select: integrationSelect,
    });
  },

  count(params: Omit<FindIntegrationsRepoInput, 'skip' | 'take' | 'sortBy' | 'sortOrder'>) {
    const where = buildWhereClause(params);
    return prisma.integrations.count({ where });
  },

  update(id: string, data: UpdateIntegrationRepoInput) {
    const updateData: Prisma.integrationsUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.base_url !== undefined) updateData.base_url = data.base_url;
    if (data.configuration !== undefined) {
      updateData.configuration = data.configuration === null ? Prisma.DbNull : data.configuration;
    }
    if (data.status !== undefined) updateData.status = data.status;
    if (data.last_connected_at !== undefined) updateData.last_connected_at = data.last_connected_at;
    updateData.updated_at = new Date();

    return prisma.integrations.update({
      where: { integration_id: id },
      data: updateData,
      select: integrationSelect,
    });
  },

  // -------------------------------------------------------------
  // Sync Schedules Repository Methods (Child-Resource Scoped)
  // -------------------------------------------------------------
  createSyncSchedule(data: CreateSyncScheduleRepoInput) {
    return prisma.sync_schedules.create({
      data: {
        integration_id: data.integration_id,
        schedule_expression: data.schedule_expression,
        is_active: data.is_active ?? true,
        next_run_at: data.next_run_at ?? null,
      },
      select: syncScheduleSelect,
    });
  },

  findSyncScheduleById(integrationId: string, scheduleId: string) {
    return prisma.sync_schedules.findFirst({
      where: {
        sync_schedule_id: scheduleId,
        integration_id: integrationId,
      },
      select: syncScheduleSelect,
    });
  },

  findSyncSchedulesByIntegrationId(integrationId: string, filter?: { isActive?: boolean }) {
    const where: Prisma.sync_schedulesWhereInput = {
      integration_id: integrationId,
    };
    if (filter?.isActive !== undefined) {
      where.is_active = filter.isActive;
    }
    return prisma.sync_schedules.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: syncScheduleSelect,
    });
  },

  async updateSyncSchedule(
    integrationId: string,
    scheduleId: string,
    data: UpdateSyncScheduleRepoInput,
  ) {
    const existing = await prisma.sync_schedules.findFirst({
      where: {
        sync_schedule_id: scheduleId,
        integration_id: integrationId,
      },
      select: { sync_schedule_id: true },
    });

    if (!existing) {
      return null;
    }

    const updateData: Prisma.sync_schedulesUpdateInput = {};
    if (data.schedule_expression !== undefined) {
      updateData.schedule_expression = data.schedule_expression;
    }
    if (data.is_active !== undefined) {
      updateData.is_active = data.is_active;
    }
    if (data.last_run_at !== undefined) {
      updateData.last_run_at = data.last_run_at;
    }
    if (data.next_run_at !== undefined) {
      updateData.next_run_at = data.next_run_at;
    }
    updateData.updated_at = new Date();

    return prisma.sync_schedules.update({
      where: { sync_schedule_id: scheduleId },
      data: updateData,
      select: syncScheduleSelect,
    });
  },

  async deleteSyncSchedule(integrationId: string, scheduleId: string): Promise<boolean> {
    const existing = await prisma.sync_schedules.findFirst({
      where: {
        sync_schedule_id: scheduleId,
        integration_id: integrationId,
      },
      select: { sync_schedule_id: true },
    });

    if (!existing) {
      return false;
    }

    await prisma.$transaction(async (tx) => {
      // Disassociate sync_jobs pointing to this schedule to preserve job history and satisfy FK
      await tx.sync_jobs.updateMany({
        where: { sync_schedule_id: scheduleId },
        data: { sync_schedule_id: null },
      });

      await tx.sync_schedules.delete({
        where: { sync_schedule_id: scheduleId },
      });
    });

    return true;
  },

  findDueSyncSchedules(now: Date = new Date()) {
    return prisma.sync_schedules.findMany({
      where: {
        is_active: true,
        next_run_at: {
          lte: now,
        },
      },
      orderBy: { next_run_at: 'asc' },
      select: syncScheduleSelect,
    });
  },

  // -------------------------------------------------------------
  // Concurrency Guard & Sync Jobs Transaction
  // -------------------------------------------------------------
  async createRunningSyncJobWithConcurrencyGuard(data: {
    integrationId: string;
    syncScheduleId?: string | null | undefined;
  }) {
    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_MS);

    return prisma.$transaction(async (tx) => {
      // Layer 1: PostgreSQL Advisory Lock (Transaction scoped)
      const lockResult = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext(${'sync:' + data.integrationId})) AS locked
      `;

      const isLocked = lockResult[0]?.locked;
      if (!isLocked) {
        throw new AppError(
          409,
          'CONCURRENT_SYNC_LOCKED',
          'Another synchronization operation is currently starting or locking this integration',
        );
      }

      // Layer 2: State Guard & Stale-Job Recovery
      const runningJobs = await tx.sync_jobs.findMany({
        where: {
          integration_id: data.integrationId,
          status: 'running',
        },
        select: {
          sync_job_id: true,
          started_at: true,
        },
      });

      let activeRunningCount = 0;

      for (const job of runningJobs) {
        if (job.started_at && job.started_at < staleThreshold) {
          // Stale job recovery: mark as failed
          await tx.sync_jobs.update({
            where: { sync_job_id: job.sync_job_id },
            data: {
              status: 'failed',
              completed_at: now,
              error_message: 'Sync job timed out / marked stale by recovery mechanism (>30m)',
            },
          });

          await tx.integration_logs.create({
            data: {
              integration_id: data.integrationId,
              sync_job_id: job.sync_job_id,
              level: 'warn',
              message: 'Stale running job was recovered and marked as failed',
              details: { recoveredJobId: job.sync_job_id, startedAt: job.started_at },
            },
          });
        } else {
          activeRunningCount++;
        }
      }

      if (activeRunningCount > 0) {
        throw new AppError(
          409,
          'ANOTHER_SYNC_IN_PROGRESS',
          'A synchronization job is already running for this integration',
        );
      }

      // Create new running job
      return tx.sync_jobs.create({
        data: {
          integration_id: data.integrationId,
          sync_schedule_id: data.syncScheduleId ?? null,
          status: 'running',
          started_at: now,
          records_processed: 0,
          records_failed: 0,
        },
        select: syncJobSelect,
      });
    });
  },

  findSyncJobById(integrationId: string, jobId: string) {
    return prisma.sync_jobs.findFirst({
      where: {
        sync_job_id: jobId,
        integration_id: integrationId,
      },
      select: syncJobSelect,
    });
  },

  findSyncJobs(params: FindSyncJobsRepoInput) {
    const where: Prisma.sync_jobsWhereInput = {
      integration_id: params.integrationId,
    };
    if (params.status) where.status = params.status;
    if (params.syncScheduleId) where.sync_schedule_id = params.syncScheduleId;

    let orderBy: Prisma.sync_jobsOrderByWithRelationInput = { created_at: params.sortOrder ?? 'desc' };
    if (params.sortBy === 'startedAt') orderBy = { started_at: params.sortOrder ?? 'desc' };
    if (params.sortBy === 'completedAt') orderBy = { completed_at: params.sortOrder ?? 'desc' };
    if (params.sortBy === 'status') orderBy = { status: params.sortOrder ?? 'desc' };
    if (params.sortBy === 'createdAt') orderBy = { created_at: params.sortOrder ?? 'desc' };

    return prisma.sync_jobs.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy,
      select: syncJobSelect,
    });
  },

  countSyncJobs(params: Omit<FindSyncJobsRepoInput, 'skip' | 'take' | 'sortBy' | 'sortOrder'>) {
    const where: Prisma.sync_jobsWhereInput = {
      integration_id: params.integrationId,
    };
    if (params.status) where.status = params.status;
    if (params.syncScheduleId) where.sync_schedule_id = params.syncScheduleId;

    return prisma.sync_jobs.count({ where });
  },

  updateSyncJob(
    jobId: string,
    data: {
      status?: string;
      records_processed?: number;
      records_failed?: number;
      completed_at?: Date | null;
      error_message?: string | null;
    },
  ) {
    const updateData: Prisma.sync_jobsUpdateInput = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.records_processed !== undefined) updateData.records_processed = data.records_processed;
    if (data.records_failed !== undefined) updateData.records_failed = data.records_failed;
    if (data.completed_at !== undefined) updateData.completed_at = data.completed_at;
    if (data.error_message !== undefined) updateData.error_message = data.error_message;

    return prisma.sync_jobs.update({
      where: { sync_job_id: jobId },
      data: updateData,
      select: syncJobSelect,
    });
  },

  findLatestActiveApiKey(integrationId: string) {
    return prisma.integration_api_keys.findFirst({
      where: {
        integration_id: integrationId,
        is_active: true,
        OR: [
          { expires_at: null },
          { expires_at: { gt: new Date() } },
        ],
      },
      orderBy: { created_at: 'desc' },
      select: activeApiKeySelect,
    });
  },

  // -------------------------------------------------------------
  // Integration Logs Repository Methods
  // -------------------------------------------------------------
  createLog(data: CreateIntegrationLogRepoInput) {
    return prisma.integration_logs.create({
      data: {
        integration_id: data.integration_id,
        sync_job_id: data.sync_job_id ?? null,
        level: data.level,
        message: data.message,
        details: data.details ?? Prisma.DbNull,
      },
      select: {
        integration_log_id: true,
        integration_id: true,
        level: true,
        message: true,
        created_at: true,
      },
    });
  },

  findIntegrationLogs(params: FindIntegrationLogsRepoInput) {
    const where: Prisma.integration_logsWhereInput = {
      integration_id: params.integrationId,
    };
    if (params.level) where.level = params.level;
    if (params.syncJobId) where.sync_job_id = params.syncJobId;

    return prisma.integration_logs.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { created_at: 'desc' },
      select: integrationLogSelect,
    });
  },

  countIntegrationLogs(params: Omit<FindIntegrationLogsRepoInput, 'skip' | 'take'>) {
    const where: Prisma.integration_logsWhereInput = {
      integration_id: params.integrationId,
    };
    if (params.level) where.level = params.level;
    if (params.syncJobId) where.sync_job_id = params.syncJobId;

    return prisma.integration_logs.count({ where });
  },
};

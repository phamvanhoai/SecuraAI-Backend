import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

export const importJobSelect = {
  import_job_id: true,
  import_type: true,
  status: true,
  total_rows: true,
  success_rows: true,
  failed_rows: true,
  error_details: true,
  created_by_user_id: true,
  created_at: true,
  completed_at: true,
  files: {
    select: {
      file_id: true,
      original_name: true,
      mime_type: true,
      size_bytes: true,
      checksum: true,
    },
  },
} satisfies Prisma.import_jobsSelect;

export type ImportJobRecord = Prisma.import_jobsGetPayload<{ select: typeof importJobSelect }>;

type ImportFileInput = {
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  actorUserId: string;
};

export const fileManagementRepository = {
  createAssetImportJob(input: ImportFileInput): Promise<ImportJobRecord> {
    return prisma.$transaction(async (transaction) => {
      const file = await transaction.files.create({
        data: {
          original_name: input.originalName,
          storage_key: input.storageKey,
          mime_type: input.mimeType,
          size_bytes: BigInt(input.sizeBytes),
          checksum: input.checksum,
          uploaded_by_user_id: input.actorUserId,
        },
        select: { file_id: true },
      });
      return transaction.import_jobs.create({
        data: {
          import_type: 'assets',
          file_id: file.file_id,
          status: 'pending',
          created_by_user_id: input.actorUserId,
        },
        select: importJobSelect,
      });
    });
  },

  markImportProcessing(importJobId: string): Promise<ImportJobRecord> {
    return prisma.import_jobs.update({
      where: { import_job_id: importJobId },
      data: { status: 'processing' },
      select: importJobSelect,
    });
  },

  completeImport(
    importJobId: string,
    counts: { totalRows: number; successRows: number; failedRows: number },
    errors: Prisma.InputJsonArray,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ): Promise<ImportJobRecord> {
    return prisma.$transaction(async (transaction) => {
      const completedAt = new Date();
      const job = await transaction.import_jobs.update({
        where: { import_job_id: importJobId },
        data: {
          status: 'completed',
          total_rows: counts.totalRows,
          success_rows: counts.successRows,
          failed_rows: counts.failedRows,
          error_details: { errors },
          completed_at: completedAt,
        },
        select: importJobSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'asset-management',
          action: 'asset.import_completed',
          entity_type: 'import_job',
          entity_id: importJobId,
          after_data: {
            ...counts,
            status: 'completed',
            completedAt: completedAt.toISOString(),
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return job;
    });
  },

  failImport(importJobId: string, code: string, message: string): Promise<void> {
    return prisma.import_jobs
      .update({
        where: { import_job_id: importJobId },
        data: {
          status: 'failed',
          error_details: { code, message },
          completed_at: new Date(),
        },
      })
      .then(() => undefined);
  },

  findAssetImportJob(importJobId: string): Promise<ImportJobRecord | null> {
    return prisma.import_jobs.findFirst({
      where: { import_job_id: importJobId, import_type: 'assets' },
      select: importJobSelect,
    });
  },
};

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { fileManagementRepository, type ImportJobRecord } from './file-management.repository.js';

const errorList = (details: Prisma.JsonValue): Prisma.JsonArray => {
  if (
    details !== null &&
    !Array.isArray(details) &&
    typeof details === 'object' &&
    Array.isArray(details.errors)
  ) {
    return details.errors;
  }
  return [];
};

const toImportJob = (job: ImportJobRecord) => ({
  id: job.import_job_id,
  importType: job.import_type,
  status: job.status,
  totalRows: job.total_rows,
  successRows: job.success_rows,
  failedRows: job.failed_rows,
  errors: errorList(job.error_details),
  file: {
    id: job.files.file_id,
    originalName: job.files.original_name,
    mimeType: job.files.mime_type,
    sizeBytes: job.files.size_bytes === null ? null : Number(job.files.size_bytes),
    checksum: job.files.checksum,
  },
  createdAt: job.created_at,
  completedAt: job.completed_at,
});

export const fileManagementService = {
  async createAssetImportJob(
    file: { originalName: string; mimeType: string; buffer: Buffer },
    actorUserId: string,
  ) {
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = path.posix.join('imports', `${randomUUID()}.xlsx`);
    const absolutePath = path.resolve(env.FILE_STORAGE_DIR, ...storageKey.split('/'));
    const storageRoot = path.resolve(env.FILE_STORAGE_DIR);
    if (!absolutePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new AppError(500, 'FILE_STORAGE_ERROR', 'Could not resolve file storage path');
    }
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });
    try {
      return await fileManagementRepository.createAssetImportJob({
        originalName: file.originalName,
        storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.buffer.byteLength,
        checksum,
        actorUserId,
      });
    } catch (error: unknown) {
      await rm(absolutePath, { force: true });
      throw error;
    }
  },

  markImportProcessing(importJobId: string) {
    return fileManagementRepository.markImportProcessing(importJobId);
  },

  completeImport(
    importJobId: string,
    counts: { totalRows: number; successRows: number; failedRows: number },
    errors: Prisma.InputJsonArray,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return fileManagementRepository.completeImport(importJobId, counts, errors, context);
  },

  failImport(importJobId: string, code: string, message: string) {
    return fileManagementRepository.failImport(importJobId, code, message);
  },

  async findAssetImportJob(importJobId: string) {
    const job = await fileManagementRepository.findAssetImportJob(importJobId);
    if (!job) throw new AppError(404, 'IMPORT_JOB_NOT_FOUND', 'Import job was not found');
    return toImportJob(job);
  },

  toImportJob,
} as const;

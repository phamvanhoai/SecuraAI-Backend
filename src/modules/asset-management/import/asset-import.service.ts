import { Prisma } from '@prisma/client';
import { AppError } from '../../../common/errors/app-error.js';
import { fileManagementService } from '../../file-management/file-management.service.js';
import { assetManagementRepository } from '../asset-management.repository.js';
import { importAssetRowSchema, type ImportAssetRow } from '../dto/import-asset-row.dto.js';
import { parseAssetWorkbook } from './asset-import.parser.js';

const maxFileSize = 5 * 1024 * 1024;
const allowedMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

type ImportActor = { userId: string; permissions: readonly string[] };
type ImportContext = { ipAddress: string | null; userAgent: string | null };
type UploadedExcelFile = { originalName: string; mimeType: string; buffer: Buffer };
type ImportError = {
  row: number;
  assetCode?: string;
  field?: string;
  code: string;
  message: string;
};

const validateFile = (file: UploadedExcelFile): void => {
  if (file.buffer.byteLength > maxFileSize) {
    throw new AppError(413, 'IMPORT_FILE_TOO_LARGE', 'Excel files may not exceed 5 MB');
  }
  if (!file.originalName.toLowerCase().endsWith('.xlsx') || !allowedMimeTypes.has(file.mimeType)) {
    throw new AppError(422, 'INVALID_IMPORT_FILE', 'Only .xlsx files are supported');
  }
  if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
    throw new AppError(
      422,
      'INVALID_IMPORT_FILE',
      'The uploaded file is not a valid .xlsx archive',
    );
  }
};

const validationError = (
  row: number,
  assetCode: string,
  issue: { path: PropertyKey[]; message: string },
): ImportError => {
  const field = issue.path[0];
  return {
    row,
    ...(assetCode !== '' && { assetCode }),
    ...(field !== undefined && { field: String(field) }),
    code: 'VALIDATION_ERROR',
    message: issue.message,
  };
};

export const assetImportService = {
  async importAssets(file: UploadedExcelFile, actor: ImportActor, context: ImportContext) {
    if (!actor.permissions.includes('assets.import')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    validateFile(file);
    const pendingJob = await fileManagementService.createAssetImportJob(file, actor.userId);
    const importJobId = pendingJob.import_job_id;

    try {
      await fileManagementService.markImportProcessing(importJobId);
      const parsedRows = await parseAssetWorkbook(file.buffer);
      const errors: ImportError[] = [];
      const validRows: { rowNumber: number; data: ImportAssetRow }[] = [];
      const seenCodes = new Set<string>();

      for (const row of parsedRows) {
        const formulaField = row.formulaFields[0];
        if (formulaField !== undefined) {
          errors.push({
            row: row.rowNumber,
            field: formulaField,
            code: 'FORMULA_NOT_ALLOWED',
            message: 'Excel formulas are not allowed in imported data',
          });
          continue;
        }
        const result = importAssetRowSchema.safeParse(row.values);
        if (!result.success) {
          const issue = result.error.issues[0];
          if (issue) errors.push(validationError(row.rowNumber, row.values.assetCode, issue));
          continue;
        }
        if (seenCodes.has(result.data.assetCode)) {
          errors.push({
            row: row.rowNumber,
            assetCode: result.data.assetCode,
            field: 'assetCode',
            code: 'DUPLICATE_ASSET_CODE_IN_FILE',
            message: 'Asset code is duplicated in the uploaded file',
          });
          continue;
        }
        seenCodes.add(result.data.assetCode);
        validRows.push({ rowNumber: row.rowNumber, data: result.data });
      }

      const [existingAssets, departments, owners] = await Promise.all([
        validRows.length === 0
          ? Promise.resolve([])
          : assetManagementRepository.findExistingAssetCodes(
              validRows.map(({ data }) => data.assetCode),
            ),
        assetManagementRepository.findDepartmentsByCodes([
          ...new Set(validRows.flatMap(({ data }) => data.departmentCode ?? [])),
        ]),
        assetManagementRepository.findOwnersByEmployeeCodes([
          ...new Set(validRows.flatMap(({ data }) => data.ownerEmployeeCode ?? [])),
        ]),
      ]);
      const existingCodes = new Set(existingAssets.map(({ asset_code }) => asset_code));
      const departmentByCode = new Map(
        departments.map((department) => [department.code.toUpperCase(), department]),
      );
      const ownerByCode = new Map(
        owners.flatMap((owner) =>
          owner.employee_code ? [[owner.employee_code.toUpperCase(), owner] as const] : [],
        ),
      );
      let successRows = 0;

      for (const { rowNumber, data } of validRows) {
        if (existingCodes.has(data.assetCode)) {
          errors.push({
            row: rowNumber,
            assetCode: data.assetCode,
            field: 'assetCode',
            code: 'ASSET_CODE_EXISTS',
            message: 'Asset code already exists',
          });
          continue;
        }
        const department = data.departmentCode
          ? departmentByCode.get(data.departmentCode.toUpperCase())
          : undefined;
        if (data.departmentCode && !department) {
          errors.push({
            row: rowNumber,
            assetCode: data.assetCode,
            field: 'departmentCode',
            code: 'DEPARTMENT_NOT_FOUND',
            message: 'Department code was not found',
          });
          continue;
        }
        if (department && department.status !== 'active') {
          errors.push({
            row: rowNumber,
            assetCode: data.assetCode,
            field: 'departmentCode',
            code: 'DEPARTMENT_INACTIVE',
            message: 'Department is not active',
          });
          continue;
        }
        const owner = data.ownerEmployeeCode
          ? ownerByCode.get(data.ownerEmployeeCode.toUpperCase())
          : undefined;
        if (data.ownerEmployeeCode && !owner) {
          errors.push({
            row: rowNumber,
            assetCode: data.assetCode,
            field: 'ownerEmployeeCode',
            code: 'ASSET_OWNER_NOT_FOUND',
            message: 'Owner employee code was not found',
          });
          continue;
        }
        if (owner && owner.status !== 'active') {
          errors.push({
            row: rowNumber,
            assetCode: data.assetCode,
            field: 'ownerEmployeeCode',
            code: 'ASSET_OWNER_INACTIVE',
            message: 'Asset owner is not active',
          });
          continue;
        }

        try {
          await assetManagementRepository.importAsset(
            {
              assetCode: data.assetCode,
              name: data.name,
              assetType: data.assetType,
              criticality: data.criticality,
              ...(data.description !== undefined && { description: data.description }),
              ...(department && { departmentId: department.department_id }),
              ...(owner && { ownerUserId: owner.user_id }),
              ...(data.hostname !== undefined && { hostname: data.hostname }),
              ...(data.ipAddress !== undefined && { ipAddress: data.ipAddress }),
              ...(data.location !== undefined && { location: data.location }),
              ...(data.metadata !== undefined && { metadata: data.metadata }),
            },
            { actorUserId: actor.userId, ...context, importJobId, rowNumber },
          );
          successRows += 1;
        } catch (error: unknown) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            errors.push({
              row: rowNumber,
              assetCode: data.assetCode,
              field: 'assetCode',
              code: 'ASSET_CODE_EXISTS',
              message: 'Asset code already exists',
            });
            continue;
          }
          throw error;
        }
      }

      const counts = {
        totalRows: parsedRows.length,
        successRows,
        failedRows: parsedRows.length - successRows,
      };
      const completed = await fileManagementService.completeImport(importJobId, counts, errors, {
        actorUserId: actor.userId,
        ...context,
      });
      return fileManagementService.toImportJob(completed);
    } catch (error: unknown) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(500, 'IMPORT_PROCESSING_FAILED', 'Asset import could not be completed');
      await fileManagementService
        .failImport(importJobId, appError.code, appError.message)
        .catch(() => undefined);
      throw new AppError(appError.statusCode, appError.code, appError.message, { importJobId });
    }
  },

  async getImportJob(importJobId: string, actor: ImportActor) {
    if (!actor.permissions.includes('assets.import')) {
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    return fileManagementService.findAssetImportJob(importJobId);
  },
};

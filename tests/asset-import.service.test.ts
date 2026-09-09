import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fileService, repository, parser } = vi.hoisted(() => ({
  fileService: {
    createAssetImportJob: vi.fn(),
    markImportProcessing: vi.fn(),
    completeImport: vi.fn(),
    failImport: vi.fn(),
    findAssetImportJob: vi.fn(),
    toImportJob: vi.fn(),
  },
  repository: {
    findExistingAssetCodes: vi.fn(),
    findDepartmentsByCodes: vi.fn(),
    findOwnersByEmployeeCodes: vi.fn(),
    importAsset: vi.fn(),
  },
  parser: vi.fn(),
}));

vi.mock('../src/modules/file-management/file-management.service.js', () => ({
  fileManagementService: fileService,
}));
vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: repository,
}));
vi.mock('../src/modules/asset-management/import/asset-import.parser.js', () => ({
  parseAssetWorkbook: parser,
}));

import { assetImportService } from '../src/modules/asset-management/import/asset-import.service.js';
import { AppError } from '../src/common/errors/app-error.js';

const file = {
  originalName: 'assets.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
};
const actor = { userId: 'user-1', permissions: ['assets.import'] };
const context = { ipAddress: null, userAgent: null };
const emptyValues = {
  assetCode: '',
  name: '',
  assetType: '',
  description: '',
  departmentCode: '',
  ownerEmployeeCode: '',
  criticality: '',
  hostname: '',
  ipAddress: '',
  location: '',
  metadata: '',
};

describe('assetImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileService.createAssetImportJob.mockResolvedValue({ import_job_id: 'job-1' });
    fileService.markImportProcessing.mockResolvedValue({});
    fileService.failImport.mockResolvedValue(undefined);
    repository.findExistingAssetCodes.mockResolvedValue([]);
    repository.findDepartmentsByCodes.mockResolvedValue([]);
    repository.findOwnersByEmployeeCodes.mockResolvedValue([]);
    repository.importAsset.mockResolvedValue({});
    fileService.completeImport.mockResolvedValue({ import_job_id: 'job-1' });
    fileService.toImportJob.mockReturnValue({ id: 'job-1', status: 'completed' });
  });

  it('defensively rejects callers without assets.import', async () => {
    await expect(
      assetImportService.importAssets(file, { userId: 'user-1', permissions: [] }, context),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(fileService.createAssetImportJob).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...file, originalName: 'assets.csv', mimeType: 'text/csv' }, 422, 'INVALID_IMPORT_FILE'],
    [{ ...file, buffer: Buffer.from('not a zip') }, 422, 'INVALID_IMPORT_FILE'],
    [{ ...file, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }, 413, 'IMPORT_FILE_TOO_LARGE'],
  ])('rejects invalid upload files before creating a job', async (candidate, statusCode, code) => {
    await expect(assetImportService.importAssets(candidate, actor, context)).rejects.toMatchObject({
      statusCode,
      code,
    });
    expect(fileService.createAssetImportJob).not.toHaveBeenCalled();
  });

  it('creates valid rows and reports duplicate and invalid rows without rolling back success', async () => {
    parser.mockResolvedValue([
      {
        rowNumber: 2,
        values: { ...emptyValues, assetCode: ' ast-101 ', name: 'Server', assetType: 'server' },
        formulaFields: [],
      },
      {
        rowNumber: 3,
        values: { ...emptyValues, assetCode: 'AST-101', name: 'Duplicate', assetType: 'server' },
        formulaFields: [],
      },
      {
        rowNumber: 4,
        values: { ...emptyValues, assetCode: 'AST-102', name: '', assetType: 'server' },
        formulaFields: [],
      },
    ]);

    await expect(assetImportService.importAssets(file, actor, context)).resolves.toEqual({
      id: 'job-1',
      status: 'completed',
    });
    expect(repository.importAsset).toHaveBeenCalledTimes(1);
    expect(repository.importAsset).toHaveBeenCalledWith(
      expect.objectContaining({ assetCode: 'AST-101', criticality: 'medium' }),
      expect.objectContaining({ importJobId: 'job-1', rowNumber: 2 }),
    );
    expect(fileService.completeImport).toHaveBeenCalledWith(
      'job-1',
      { totalRows: 3, successRows: 1, failedRows: 2 },
      expect.arrayContaining([
        expect.objectContaining({ row: 3, code: 'DUPLICATE_ASSET_CODE_IN_FILE' }),
        expect.objectContaining({ row: 4, code: 'VALIDATION_ERROR' }),
      ]),
      expect.objectContaining({ actorUserId: 'user-1' }),
    );
  });

  it('marks a created job as failed when the workbook cannot be processed', async () => {
    parser.mockRejectedValue({ statusCode: 422, code: 'INVALID_IMPORT_FILE', message: 'bad file' });

    await expect(assetImportService.importAssets(file, actor, context)).rejects.toMatchObject({
      statusCode: 500,
      code: 'IMPORT_PROCESSING_FAILED',
    });
    expect(fileService.failImport).toHaveBeenCalledWith(
      'job-1',
      'IMPORT_PROCESSING_FAILED',
      'Asset import could not be completed',
    );
  });

  it('preserves a workbook error and stores the failed job status', async () => {
    parser.mockRejectedValue(
      new AppError(422, 'INVALID_IMPORT_TEMPLATE', 'Required Excel columns are missing'),
    );

    await expect(assetImportService.importAssets(file, actor, context)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_IMPORT_TEMPLATE',
      details: { importJobId: 'job-1' },
    });
    expect(fileService.failImport).toHaveBeenCalledWith(
      'job-1',
      'INVALID_IMPORT_TEMPLATE',
      'Required Excel columns are missing',
    );
  });

  it('reports existing assets, formula use, missing relations and inactive relations', async () => {
    parser.mockResolvedValue([
      {
        rowNumber: 2,
        values: { ...emptyValues, assetCode: 'AST-EXISTS', name: 'Existing', assetType: 'server' },
        formulaFields: [],
      },
      {
        rowNumber: 3,
        values: { ...emptyValues, assetCode: 'AST-FORMULA', name: '', assetType: 'server' },
        formulaFields: ['name'],
      },
      {
        rowNumber: 4,
        values: {
          ...emptyValues,
          assetCode: 'AST-NO-DEPT',
          name: 'No department',
          assetType: 'server',
          departmentCode: 'MISSING',
        },
        formulaFields: [],
      },
      {
        rowNumber: 5,
        values: {
          ...emptyValues,
          assetCode: 'AST-INACTIVE-DEPT',
          name: 'Inactive department',
          assetType: 'server',
          departmentCode: 'OLD',
        },
        formulaFields: [],
      },
      {
        rowNumber: 6,
        values: {
          ...emptyValues,
          assetCode: 'AST-NO-OWNER',
          name: 'No owner',
          assetType: 'server',
          ownerEmployeeCode: 'MISSING',
        },
        formulaFields: [],
      },
      {
        rowNumber: 7,
        values: {
          ...emptyValues,
          assetCode: 'AST-INACTIVE-OWNER',
          name: 'Inactive owner',
          assetType: 'server',
          ownerEmployeeCode: 'EMP-OLD',
        },
        formulaFields: [],
      },
    ]);
    repository.findExistingAssetCodes.mockResolvedValue([{ asset_code: 'AST-EXISTS' }]);
    repository.findDepartmentsByCodes.mockResolvedValue([
      { department_id: 'department-1', code: 'OLD', status: 'inactive' },
    ]);
    repository.findOwnersByEmployeeCodes.mockResolvedValue([
      { user_id: 'owner-1', employee_code: 'EMP-OLD', status: 'inactive' },
    ]);

    await assetImportService.importAssets(file, actor, context);

    expect(repository.importAsset).not.toHaveBeenCalled();
    expect(fileService.completeImport).toHaveBeenCalledWith(
      'job-1',
      { totalRows: 6, successRows: 0, failedRows: 6 },
      expect.arrayContaining([
        expect.objectContaining({ row: 2, code: 'ASSET_CODE_EXISTS' }),
        expect.objectContaining({ row: 3, code: 'FORMULA_NOT_ALLOWED' }),
        expect.objectContaining({ row: 4, code: 'DEPARTMENT_NOT_FOUND' }),
        expect.objectContaining({ row: 5, code: 'DEPARTMENT_INACTIVE' }),
        expect.objectContaining({ row: 6, code: 'ASSET_OWNER_NOT_FOUND' }),
        expect.objectContaining({ row: 7, code: 'ASSET_OWNER_INACTIVE' }),
      ]),
      expect.any(Object),
    );
  });

  it('returns a stored job and rejects a missing job through file management', async () => {
    fileService.findAssetImportJob.mockResolvedValueOnce({ id: 'job-1' });
    await expect(assetImportService.getImportJob('job-1', actor)).resolves.toEqual({ id: 'job-1' });

    fileService.findAssetImportJob.mockRejectedValueOnce(
      new AppError(404, 'IMPORT_JOB_NOT_FOUND', 'Import job was not found'),
    );
    await expect(assetImportService.getImportJob('missing', actor)).rejects.toMatchObject({
      statusCode: 404,
      code: 'IMPORT_JOB_NOT_FOUND',
    });
  });
});

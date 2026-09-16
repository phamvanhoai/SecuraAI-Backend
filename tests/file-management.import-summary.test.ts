import { describe, expect, it } from 'vitest';
import { fileManagementService } from '../src/modules/file-management/file-management.service.js';

const completedJob = {
  import_job_id: 'job-1',
  import_type: 'assets',
  status: 'completed',
  total_rows: 5,
  success_rows: 2,
  failed_rows: 3,
  error_details: {
    errors: [
      { row: 3, assetCode: 'AST-001', code: 'DUPLICATE_ASSET_CODE_IN_FILE', message: 'Duplicate' },
      { row: 4, assetCode: 'AST-002', code: 'ASSET_CODE_EXISTS', message: 'Exists' },
      {
        row: 5,
        assetCode: 'AST-003',
        code: 'ASSET_CODE_DELETED',
        message: 'Deleted',
      },
    ],
  },
  created_by_user_id: 'user-1',
  created_at: new Date('2026-09-14T10:00:00.000Z'),
  completed_at: new Date('2026-09-14T10:01:00.000Z'),
  files: {
    file_id: 'file-1',
    original_name: 'assets.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: BigInt(1024),
    checksum: 'checksum',
  },
};

describe('fileManagementService import summary', () => {
  it('separates imported, duplicate and invalid rows', () => {
    const result = fileManagementService.toImportJob(completedJob);

    expect(result.summary).toEqual({
      totalRows: 5,
      importedRows: 2,
      duplicateRows: 3,
      invalidRows: 0,
      message: 'Import completed: 2 assets imported, 3 duplicates skipped, 0 invalid rows.',
    });
    expect(result.errors).toHaveLength(3);
  });
});

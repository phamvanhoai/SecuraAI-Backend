import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAssetMock,
  classifyCriticalityMock,
  findByCodeMock,
  findByIdMock,
  findOwnerByIdMock,
  listAssetsMock,
  softDeleteMock,
  updateAssetMock,
  assignOwnerMock,
  importAssetsMock,
  getImportJobMock,
  exportAssetsMock,
  findAssetForHistoryMock,
  listHistoryMock,
  listCreateOptionsMock,
} = vi.hoisted(() => ({
  createAssetMock: vi.fn(),
  classifyCriticalityMock: vi.fn(),
  findByCodeMock: vi.fn(),
  findByIdMock: vi.fn(),
  findOwnerByIdMock: vi.fn(),
  listAssetsMock: vi.fn(),
  softDeleteMock: vi.fn(),
  updateAssetMock: vi.fn(),
  assignOwnerMock: vi.fn(),
  importAssetsMock: vi.fn(),
  getImportJobMock: vi.fn(),
  exportAssetsMock: vi.fn(),
  findAssetForHistoryMock: vi.fn(),
  listHistoryMock: vi.fn(),
  listCreateOptionsMock: vi.fn(),
}));

vi.mock('../src/modules/asset-management/asset-management.repository.js', () => ({
  assetManagementRepository: {
    assignOwner: assignOwnerMock,
    classifyCriticality: classifyCriticalityMock,
    create: createAssetMock,
    findByCode: findByCodeMock,
    findById: findByIdMock,
    findDepartmentById: vi.fn(),
    findOwnerById: findOwnerByIdMock,
    list: listAssetsMock,
    softDelete: softDeleteMock,
    update: updateAssetMock,
    findAssetForHistory: findAssetForHistoryMock,
    listHistory: listHistoryMock,
    listCreateOptions: listCreateOptionsMock,
  },
}));

vi.mock('../src/modules/asset-management/import/asset-import.service.js', () => ({
  assetImportService: {
    importAssets: importAssetsMock,
    getImportJob: getImportJobMock,
  },
}));

vi.mock('../src/modules/asset-management/export/asset-export.service.js', () => ({
  assetExportService: { exportAssets: exportAssetsMock },
}));

import { createApp } from '../src/app.js';

const accessToken = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('GET /api/v1/assets/create-options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCreateOptionsMock.mockResolvedValue({
      departments: [{ department_id: 'department-1', code: 'IT', name: 'IT' }],
      owners: [{ user_id: 'owner-1', full_name: 'Duong', employee_code: null }],
      departmentsTruncated: false,
      ownersTruncated: false,
    });
  });

  it('requires authentication and an asset form permission', async () => {
    const unauthenticated = await request(createApp()).get('/api/v1/assets/create-options');
    const forbidden = await request(createApp())
      .get('/api/v1/assets/create-options')
      .set('authorization', `Bearer ${accessToken([])}`);

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(listCreateOptionsMock).not.toHaveBeenCalled();
  });

  it('returns safe active department and owner fields', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets/create-options')
      .set('authorization', `Bearer ${accessToken(['assets.assign-owner'])}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        departments: [{ id: 'department-1', code: 'IT', name: 'IT' }],
        owners: [{ id: 'owner-1', fullName: 'Duong', employeeCode: null }],
        truncated: { departments: false, owners: false },
      },
    });
  });
});

describe('GET /api/v1/assets/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportAssetsMock.mockResolvedValue({
      buffer: Buffer.from('xlsx'),
      filename: 'assets-20260909-120000.xlsx',
      exportedRows: 2,
    });
  });

  it('requires authentication and assets.export', async () => {
    const unauthenticated = await request(createApp()).get('/api/v1/assets/export');
    const forbidden = await request(createApp())
      .get('/api/v1/assets/export')
      .set('authorization', `Bearer ${accessToken([])}`);

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(exportAssetsMock).not.toHaveBeenCalled();
  });

  it('validates filters and returns the generated Excel attachment', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets/export?assetType=server&status=active&sortBy=name&sortOrder=desc')
      .set('authorization', `Bearer ${accessToken(['assets.export'])}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain('assets-20260909-120000.xlsx');
    expect(response.headers['x-exported-rows']).toBe('2');
    expect(exportAssetsMock).toHaveBeenCalledWith(
      { assetType: 'server', status: 'active', sortBy: 'name', sortOrder: 'desc' },
      expect.objectContaining({ permissions: ['assets.export'] }),
      expect.any(Object),
    );
  });

  it('rejects invalid filters before generating a workbook', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets/export?status=deleted')
      .set('authorization', `Bearer ${accessToken(['assets.export'])}`);

    expect(response.status).toBe(422);
    expect(exportAssetsMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/assets/:assetId/history', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';

  beforeEach(() => {
    vi.clearAllMocks();
    findAssetForHistoryMock.mockResolvedValue({
      asset_id: assetId,
      asset_code: 'AST-001',
      name: 'Server',
      deleted_at: null,
    });
    listHistoryMock.mockResolvedValue({ items: [], total: 0 });
  });

  it('requires authentication and assets.history.read', async () => {
    const unauthenticated = await request(createApp()).get(`/api/v1/assets/${assetId}/history`);
    const forbidden = await request(createApp())
      .get(`/api/v1/assets/${assetId}/history`)
      .set('authorization', `Bearer ${accessToken([])}`);

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(listHistoryMock).not.toHaveBeenCalled();
  });

  it('returns paginated history using normalized filters', async () => {
    const response = await request(createApp())
      .get(`/api/v1/assets/${assetId}/history?page=2&limit=10&action=updated&sortOrder=asc`)
      .set('authorization', `Bearer ${accessToken(['assets.history.read'])}`);

    expect(response.status).toBe(200);
    expect(response.body.data.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 0,
      totalPages: 0,
    });
    expect(listHistoryMock).toHaveBeenCalledWith(assetId, {
      page: 2,
      limit: 10,
      action: 'updated',
      sortOrder: 'asc',
    });
  });

  it('rejects invalid asset IDs, actions and date ranges', async () => {
    const token = accessToken(['assets.history.read']);
    const invalidId = await request(createApp())
      .get('/api/v1/assets/not-a-uuid/history')
      .set('authorization', `Bearer ${token}`);
    const invalidAction = await request(createApp())
      .get(`/api/v1/assets/${assetId}/history?action=changed`)
      .set('authorization', `Bearer ${token}`);
    const invalidRange = await request(createApp())
      .get(
        `/api/v1/assets/${assetId}/history?from=2026-10-01T00%3A00%3A00.000Z&to=2026-09-01T00%3A00%3A00.000Z`,
      )
      .set('authorization', `Bearer ${token}`);

    expect(invalidId.status).toBe(422);
    expect(invalidAction.status).toBe(422);
    expect(invalidRange.status).toBe(422);
    expect(listHistoryMock).not.toHaveBeenCalled();
  });
});

describe('asset Excel import HTTP endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importAssetsMock.mockResolvedValue({ id: 'job-1', status: 'completed' });
    getImportJobMock.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000010' });
  });

  it('requires assets.import before accepting a workbook', async () => {
    const response = await request(createApp())
      .post('/api/v1/assets/import')
      .set('authorization', `Bearer ${accessToken([])}`)
      .attach('file', Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'assets.xlsx');

    expect(response.status).toBe(403);
    expect(importAssetsMock).not.toHaveBeenCalled();
  });

  it('passes an uploaded .xlsx file to the import use case', async () => {
    const response = await request(createApp())
      .post('/api/v1/assets/import')
      .set('authorization', `Bearer ${accessToken(['assets.import'])}`)
      .attach('file', Buffer.from([0x50, 0x4b, 0x03, 0x04]), {
        filename: 'assets.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { id: 'job-1', status: 'completed' },
    });
    expect(importAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({ originalName: 'assets.xlsx' }),
      expect.objectContaining({ permissions: ['assets.import'] }),
      expect.any(Object),
    );
  });

  it('rejects a missing file and an invalid import job ID', async () => {
    const token = accessToken(['assets.import']);
    const missingFile = await request(createApp())
      .post('/api/v1/assets/import')
      .set('authorization', `Bearer ${token}`);
    const invalidId = await request(createApp())
      .get('/api/v1/assets/imports/not-a-uuid')
      .set('authorization', `Bearer ${token}`);

    expect(missingFile.status).toBe(422);
    expect(missingFile.body.error.code).toBe('INVALID_IMPORT_FILE');
    expect(invalidId.status).toBe(422);
    expect(getImportJobMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAssetsMock.mockResolvedValue({ items: [], total: 0 });
  });

  it('requires authentication', async () => {
    const response = await request(createApp()).get('/api/v1/assets');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  it('requires the assets.read permission', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets')
      .set('authorization', `Bearer ${accessToken([])}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  it('returns a paginated list and normalized query values', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets?page=2&limit=10&status=active&q=server')
      .set('authorization', `Bearer ${accessToken(['assets.read'])}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: {
        items: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      },
    });
    expect(listAssetsMock).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      status: 'active',
      q: 'server',
      sortBy: 'assetCode',
      sortOrder: 'asc',
    });
  });

  it('rejects invalid filters before reaching the controller', async () => {
    const response = await request(createApp())
      .get('/api/v1/assets?limit=101')
      .set('authorization', `Bearer ${accessToken(['assets.read'])}`);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(listAssetsMock).not.toHaveBeenCalled();
  });

  it('combines search, all filters, pagination and sorting', async () => {
    const departmentId = '00000000-0000-4000-8000-000000000020';
    const ownerUserId = '00000000-0000-4000-8000-000000000021';
    const response = await request(createApp())
      .get(
        `/api/v1/assets?q=%20DB-Server%20&assetType=server&criticality=critical&status=active&departmentId=${departmentId}&ownerUserId=${ownerUserId}&page=3&limit=5&sortBy=name&sortOrder=desc`,
      )
      .set('authorization', `Bearer ${accessToken(['assets.read'])}`);

    expect(response.status).toBe(200);
    expect(listAssetsMock).toHaveBeenCalledWith({
      q: 'DB-Server',
      assetType: 'server',
      criticality: 'critical',
      status: 'active',
      departmentId,
      ownerUserId,
      page: 3,
      limit: 5,
      sortBy: 'name',
      sortOrder: 'desc',
    });
  });
});

describe('GET /api/v1/assets/:assetId', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';
  const record = {
    asset_id: assetId,
    asset_code: 'AST-DETAIL-001',
    name: 'Frontend Test Server',
    asset_type: 'server',
    description: 'Asset detail test',
    department_id: null,
    owner_user_id: null,
    criticality: 'medium',
    hostname: 'fe-test-server',
    ip_address: '192.168.1.50',
    location: 'Server Room',
    status: 'active',
    metadata: { environment: 'test' },
    retired_at: null,
    created_at: new Date('2026-09-10T08:00:00.000Z'),
    updated_at: new Date('2026-09-10T08:30:00.000Z'),
    departments: null,
    users_assets_owner_user_idTousers: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(record);
  });

  it('requires authentication and assets.read', async () => {
    const unauthenticated = await request(createApp()).get(`/api/v1/assets/${assetId}`);
    const forbidden = await request(createApp())
      .get(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken([])}`);

    expect(unauthenticated.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it('returns complete asset details', async () => {
    const response = await request(createApp())
      .get(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken(['assets.read'])}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        id: assetId,
        hostname: 'fe-test-server',
        ipAddress: '192.168.1.50',
        location: 'Server Room',
      },
    });
    expect(response.body.data).not.toHaveProperty('metadata');
  });

  it('rejects invalid IDs and returns 404 for missing or deleted assets', async () => {
    const token = accessToken(['assets.read']);
    const invalid = await request(createApp())
      .get('/api/v1/assets/not-a-uuid')
      .set('authorization', `Bearer ${token}`);
    findByIdMock.mockResolvedValueOnce(null);
    const missing = await request(createApp())
      .get(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${token}`);

    expect(invalid.status).toBe(422);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ASSET_NOT_FOUND');
  });
});

describe('PATCH /api/v1/assets/:assetId', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';
  const record = {
    asset_id: assetId,
    asset_code: 'AST-001',
    name: 'Database Server',
    asset_type: 'server',
    description: null,
    department_id: null,
    owner_user_id: null,
    criticality: 'medium',
    hostname: null,
    ip_address: null,
    location: 'Server Room',
    status: 'active',
    metadata: {},
    retired_at: null,
    created_at: new Date('2026-09-07T10:00:00.000Z'),
    updated_at: new Date('2026-09-07T10:00:00.000Z'),
    departments: null,
    users_assets_owner_user_idTousers: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(record);
    updateAssetMock.mockResolvedValue({ ...record, name: 'Updated Server' });
  });

  it('requires assets.update and validates params and body', async () => {
    const forbidden = await request(createApp())
      .patch(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken([])}`)
      .send({ name: 'Updated Server' });
    const invalid = await request(createApp())
      .patch('/api/v1/assets/not-a-uuid')
      .set('authorization', `Bearer ${accessToken(['assets.update'])}`)
      .send({});

    expect(forbidden.status).toBe(403);
    expect(invalid.status).toBe(422);
    expect(updateAssetMock).not.toHaveBeenCalled();
  });

  it('updates an asset and returns 200', async () => {
    const response = await request(createApp())
      .patch(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken(['assets.update'])}`)
      .send({ name: 'Updated Server' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { id: assetId, assetCode: 'AST-001', name: 'Updated Server' },
    });
    expect(updateAssetMock).toHaveBeenCalledOnce();
  });

  it('rejects direct criticality updates', async () => {
    const response = await request(createApp())
      .patch(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken(['assets.update'])}`)
      .send({ criticality: 'low' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(findByIdMock).not.toHaveBeenCalled();
    expect(updateAssetMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/assets/:assetId', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';

  beforeEach(() => {
    vi.clearAllMocks();
    softDeleteMock.mockResolvedValue({ kind: 'deleted' });
  });

  it('requires authentication and assets.delete', async () => {
    const unauthorized = await request(createApp()).delete(`/api/v1/assets/${assetId}`);
    const forbidden = await request(createApp())
      .delete(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken([])}`);

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('validates the asset ID', async () => {
    const response = await request(createApp())
      .delete('/api/v1/assets/not-a-uuid')
      .set('authorization', `Bearer ${accessToken(['assets.delete'])}`);

    expect(response.status).toBe(422);
    expect(softDeleteMock).not.toHaveBeenCalled();
  });

  it('returns 409 with dependency counts when deletion is blocked', async () => {
    softDeleteMock.mockResolvedValue({
      kind: 'blocked',
      dependencies: {
        riskAssessments: 1,
        openAlerts: 0,
        activeLogSources: 0,
        enabledAlertThresholds: 0,
        openIncidents: 0,
      },
    });
    const response = await request(createApp())
      .delete(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken(['assets.delete'])}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ASSET_HAS_ACTIVE_DEPENDENCIES');
  });

  it('returns 204 after a successful soft deletion', async () => {
    const response = await request(createApp())
      .delete(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken(['assets.delete'])}`);

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });
});

describe('POST /api/v1/assets/:assetId/classify-criticality', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';
  const body = {
    confidentialityImpact: 4,
    integrityImpact: 5,
    availabilityImpact: 5,
    businessImpact: 4,
    reason: 'Production customer database',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue({
      asset_id: assetId,
      criticality: 'medium',
      status: 'active',
    });
    classifyCriticalityMock.mockResolvedValue(undefined);
  });

  it('requires authentication and assets.classify', async () => {
    const unauthorized = await request(createApp())
      .post(`/api/v1/assets/${assetId}/classify-criticality`)
      .send(body);
    const forbidden = await request(createApp())
      .post(`/api/v1/assets/${assetId}/classify-criticality`)
      .set('authorization', `Bearer ${accessToken([])}`)
      .send(body);

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(classifyCriticalityMock).not.toHaveBeenCalled();
  });

  it('validates path, scores and reason before classification', async () => {
    const response = await request(createApp())
      .post('/api/v1/assets/not-a-uuid/classify-criticality')
      .set('authorization', `Bearer ${accessToken(['assets.classify'])}`)
      .send({ ...body, availabilityImpact: 6, reason: '' });

    expect(response.status).toBe(422);
    expect(classifyCriticalityMock).not.toHaveBeenCalled();
  });

  it('returns the server-calculated classification', async () => {
    const response = await request(createApp())
      .post(`/api/v1/assets/${assetId}/classify-criticality`)
      .set('authorization', `Bearer ${accessToken(['assets.classify'])}`)
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        assetId,
        previousCriticality: 'medium',
        criticality: 'critical',
        score: 4.55,
        changed: true,
      },
    });
  });

  it('returns 404 for an unknown or soft-deleted asset', async () => {
    findByIdMock.mockResolvedValue(null);
    const response = await request(createApp())
      .post(`/api/v1/assets/${assetId}/classify-criticality`)
      .set('authorization', `Bearer ${accessToken(['assets.classify'])}`)
      .send(body);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ASSET_NOT_FOUND');
    expect(classifyCriticalityMock).not.toHaveBeenCalled();
  });

  it('returns 422 for a disposed asset', async () => {
    findByIdMock.mockResolvedValue({
      asset_id: assetId,
      criticality: 'medium',
      status: 'disposed',
    });
    const response = await request(createApp())
      .post(`/api/v1/assets/${assetId}/classify-criticality`)
      .set('authorization', `Bearer ${accessToken(['assets.classify'])}`)
      .send(body);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('ASSET_DISPOSED');
    expect(classifyCriticalityMock).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/assets/:assetId/owner', () => {
  const assetId = '00000000-0000-4000-8000-000000000010';
  const ownerId = '00000000-0000-4000-8000-000000000020';
  const record = {
    asset_id: assetId,
    owner_user_id: null,
    status: 'active',
    users_assets_owner_user_idTousers: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findByIdMock.mockResolvedValue(record);
    const owner = { user_id: ownerId, full_name: 'Asset Owner', status: 'active' };
    findOwnerByIdMock.mockResolvedValue(owner);
    assignOwnerMock.mockResolvedValue({
      ...record,
      owner_user_id: ownerId,
      users_assets_owner_user_idTousers: owner,
    });
  });

  it('requires authentication and assets.assign-owner', async () => {
    const body = { ownerUserId: ownerId, reason: 'Assign responsibility' };
    const unauthorized = await request(createApp())
      .put(`/api/v1/assets/${assetId}/owner`)
      .send(body);
    const forbidden = await request(createApp())
      .put(`/api/v1/assets/${assetId}/owner`)
      .set('authorization', `Bearer ${accessToken([])}`)
      .send(body);

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(assignOwnerMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid ID, missing reason and direct PATCH owner updates', async () => {
    const invalid = await request(createApp())
      .put('/api/v1/assets/not-a-uuid/owner')
      .set('authorization', `Bearer ${accessToken(['assets.assign-owner'])}`)
      .send({ ownerUserId: ownerId, reason: '' });
    const directPatch = await request(createApp())
      .patch(`/api/v1/assets/${assetId}`)
      .set('authorization', `Bearer ${accessToken(['assets.update'])}`)
      .send({ ownerUserId: ownerId });

    expect(invalid.status).toBe(422);
    expect(directPatch.status).toBe(422);
    expect(assignOwnerMock).not.toHaveBeenCalled();
  });

  it('assigns an active owner and returns 200', async () => {
    const response = await request(createApp())
      .put(`/api/v1/assets/${assetId}/owner`)
      .set('authorization', `Bearer ${accessToken(['assets.assign-owner'])}`)
      .send({ ownerUserId: ownerId, reason: 'Assign responsibility' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        assetId,
        previousOwner: null,
        owner: { id: ownerId, fullName: 'Asset Owner' },
        changed: true,
      },
    });
  });

  it('supports unassignment with ownerUserId=null', async () => {
    const response = await request(createApp())
      .put(`/api/v1/assets/${assetId}/owner`)
      .set('authorization', `Bearer ${accessToken(['assets.assign-owner'])}`)
      .send({ ownerUserId: null, reason: 'Remove responsibility' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ changed: false, owner: null, assignedAt: null });
    expect(assignOwnerMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByCodeMock.mockResolvedValue(null);
    createAssetMock.mockResolvedValue({
      asset_id: '00000000-0000-4000-8000-000000000010',
      asset_code: 'AST-001',
      name: 'Database Server',
      asset_type: 'server',
      criticality: 'medium',
      status: 'active',
      location: null,
      description: null,
      hostname: null,
      ip_address: null,
      created_at: new Date('2026-09-07T10:00:00.000Z'),
      updated_at: new Date('2026-09-07T10:00:00.000Z'),
      departments: null,
      users_assets_owner_user_idTousers: null,
    });
  });

  it('requires authentication and the assets.create permission', async () => {
    const unauthorized = await request(createApp()).post('/api/v1/assets').send({});
    const forbidden = await request(createApp())
      .post('/api/v1/assets')
      .set('authorization', `Bearer ${accessToken([])}`)
      .send({ assetCode: 'AST-001', name: 'Server', assetType: 'server' });

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(createAssetMock).not.toHaveBeenCalled();
  });

  it('validates the request before creating an asset', async () => {
    const response = await request(createApp())
      .post('/api/v1/assets')
      .set('authorization', `Bearer ${accessToken(['assets.create'])}`)
      .send({ assetCode: 'invalid code', name: 'Server', assetType: 'server' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(createAssetMock).not.toHaveBeenCalled();
  });

  it('returns 201 and normalizes the asset code', async () => {
    const response = await request(createApp())
      .post('/api/v1/assets')
      .set('authorization', `Bearer ${accessToken(['assets.create'])}`)
      .send({ assetCode: 'ast-001', name: 'Database Server', assetType: 'server' });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      success: true,
      data: { assetCode: 'AST-001', status: 'active' },
    });
    expect(findByCodeMock).toHaveBeenCalledWith('AST-001');
  });
});

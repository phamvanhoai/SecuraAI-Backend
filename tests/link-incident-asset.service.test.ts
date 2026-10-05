import { beforeEach, describe, expect, it, vi } from 'vitest';
import { incidentAssetsRepository } from '../src/modules/information-security-incident-management/incident-assets.repository.js';
import { incidentAssetsService } from '../src/modules/information-security-incident-management/incident-assets.service.js';

vi.mock(
  '../src/modules/information-security-incident-management/incident-assets.repository.js',
  () => ({
    incidentAssetsRepository: {
      findActor: vi.fn(),
      findIncident: vi.fn(),
      findActiveAsset: vi.fn(),
      findOptions: vi.fn(),
      link: vi.fn(),
      unlink: vi.fn(),
    },
  }),
);

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';

describe('incidentAssetsService.options', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns bounded search results and pagination', async () => {
    const query = { q: 'VPN', scope: 'unlinked' as const, page: 2, limit: 10 };
    vi.mocked(incidentAssetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentAssetsRepository.findOptions).mockResolvedValue({
      incident: {
        id: incidentId,
        incident_code: 'INC-001',
        title: 'Suspicious login',
        status: 'OPEN',
      },
      assets: [
        {
          id: assetId,
          asset_code: 'AST-001',
          name: 'VPN Gateway',
          asset_type: 'gateway',
          criticality: 'critical',
          incident_assets: [],
        },
      ],
      total: 13,
    });

    await expect(incidentAssetsService.options(userId, incidentId, query)).resolves.toMatchObject({
      assets: [{ assetCode: 'AST-001', linked: false }],
      pagination: { page: 2, limit: 10, total: 13, totalPages: 2 },
    });
    expect(incidentAssetsRepository.findOptions).toHaveBeenCalledWith(incidentId, query);
  });
});

describe('incidentAssetsService.link', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows only an active Security Officer', async () => {
    vi.mocked(incidentAssetsRepository.findActor).mockResolvedValue({
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });
    await expect(incidentAssetsService.link(userId, incidentId, { assetId })).rejects.toMatchObject(
      {
        statusCode: 403,
        code: 'FORBIDDEN',
      },
    );
  });

  it('rejects an inactive or missing asset', async () => {
    vi.mocked(incidentAssetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentAssetsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentAssetsRepository.findActiveAsset).mockResolvedValue(null);
    await expect(incidentAssetsService.link(userId, incidentId, { assetId })).rejects.toMatchObject(
      {
        statusCode: 404,
        code: 'ASSET_NOT_FOUND',
      },
    );
    expect(incidentAssetsRepository.link).not.toHaveBeenCalled();
  });

  it('returns the linked incident and asset', async () => {
    vi.mocked(incidentAssetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentAssetsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentAssetsRepository.findActiveAsset).mockResolvedValue({
      id: assetId,
      asset_code: 'AST-001',
      name: 'VPN Gateway',
      criticality: 'critical',
    });
    vi.mocked(incidentAssetsRepository.link).mockResolvedValue({
      linked_at: new Date('2026-09-29T10:00:00Z'),
      incidents: { id: incidentId, incident_code: 'INC-001', title: 'Suspicious login' },
      assets: { id: assetId, asset_code: 'AST-001', name: 'VPN Gateway', criticality: 'critical' },
    });

    await expect(
      incidentAssetsService.link(userId, incidentId, { assetId }),
    ).resolves.toMatchObject({
      incident: { incidentCode: 'INC-001' },
      asset: { assetCode: 'AST-001' },
    });
    expect(incidentAssetsRepository.link).toHaveBeenCalledWith(incidentId, assetId, userId);
  });
});

describe('incidentAssetsService.unlink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes an existing incident asset link', async () => {
    vi.mocked(incidentAssetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentAssetsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentAssetsRepository.unlink).mockResolvedValue({ count: 1 });

    await expect(
      incidentAssetsService.unlink(userId, incidentId, assetId),
    ).resolves.toBeUndefined();
    expect(incidentAssetsRepository.unlink).toHaveBeenCalledWith(incidentId, assetId);
  });

  it('rejects an asset that is not linked to the incident', async () => {
    vi.mocked(incidentAssetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(incidentAssetsRepository.findIncident).mockResolvedValue({
      id: incidentId,
      incident_code: 'INC-001',
      title: 'Suspicious login',
      status: 'OPEN',
    });
    vi.mocked(incidentAssetsRepository.unlink).mockResolvedValue({ count: 0 });

    await expect(incidentAssetsService.unlink(userId, incidentId, assetId)).rejects.toMatchObject({
      statusCode: 404,
      code: 'INCIDENT_ASSET_LINK_NOT_FOUND',
    });
  });
});

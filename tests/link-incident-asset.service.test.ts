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
    },
  }),
);

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '22222222-2222-4222-8222-222222222222';
const assetId = '33333333-3333-4333-8333-333333333333';

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

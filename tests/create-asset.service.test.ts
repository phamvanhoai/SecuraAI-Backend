import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';
import { assetsService } from '../src/modules/it-asset-management/assets.service.js';

vi.mock('../src/modules/it-asset-management/assets.repository.js', () => ({
  assetsRepository: {
    findActor: vi.fn(),
    validateCreateReferences: vi.fn(),
    create: vi.fn(),
    findCreateOptions: vi.fn(),
  },
}));
const userId = '11111111-1111-4111-8111-111111111111';
const input = {
  name: 'App Server',
  assetType: 'SERVER' as const,
  dependencies: [],
  eventSourceIds: [],
};

describe('assetsService.create', () => {
  beforeEach(() => vi.clearAllMocks());
  it('generates an opaque asset code instead of accepting one from the caller', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(assetsRepository.validateCreateReferences).mockResolvedValue({
      ownerValid: true,
      serviceValid: true,
      dependenciesValid: true,
      eventSourcesValid: true,
    });
    vi.mocked(assetsRepository.create).mockResolvedValue({
      id: userId,
      asset_code: 'AST-12AB34CD',
      name: input.name,
      asset_type: input.assetType,
      criticality: null,
      data_classification: null,
      description: null,
      status: 'ACTIVE',
      owner_user_id: null,
      created_at: new Date('2026-10-12T00:00:00Z'),
      updated_at: new Date('2026-10-12T00:00:00Z'),
      users_assets_owner_user_idTousers: null,
      business_services: null,
    });

    await expect(assetsService.create(userId, input)).resolves.toMatchObject({
      assetCode: 'AST-12AB34CD',
    });
    expect(assetsRepository.create).toHaveBeenCalledWith(
      userId,
      expect.stringMatching(/^AST-[A-F0-9]{8}$/),
      input,
    );
  });
  it('allows only an active Security Officer', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(assetsService.create(userId, input)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
  it('rejects unavailable related records before creating', async () => {
    vi.mocked(assetsRepository.findActor).mockResolvedValue({
      role: 'SECURITY_OFFICER',
      status: 'ACTIVE',
    });
    vi.mocked(assetsRepository.validateCreateReferences).mockResolvedValue({
      ownerValid: true,
      serviceValid: true,
      dependenciesValid: true,
      eventSourcesValid: false,
    });
    await expect(assetsService.create(userId, input)).rejects.toMatchObject({
      statusCode: 422,
      code: 'INVALID_EVENT_SOURCE',
    });
    expect(assetsRepository.create).not.toHaveBeenCalled();
  });
});

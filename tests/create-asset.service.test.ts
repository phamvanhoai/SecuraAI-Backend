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
  assetCode: 'AST-002',
  name: 'App Server',
  assetType: 'server',
  criticality: 'high' as const,
  dataClassification: 'confidential',
  dependencies: [],
  eventSourceIds: [],
};

describe('assetsService.create', () => {
  beforeEach(() => vi.clearAllMocks());
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

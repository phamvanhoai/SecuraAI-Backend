import { AppError } from '../../common/errors/app-error.js';
import { businessServicesRepository } from './business-services.repository.js';
import type { CreateBusinessServiceInput } from './dto/create-business-service.dto.js';
import type { UpdateBusinessServiceInput } from './dto/update-business-service.dto.js';
import type { DeactivateBusinessServiceInput } from './dto/deactivate-business-service.dto.js';
import type {
  ListBusinessServicesQuery,
  ServicePageQuery,
} from './dto/list-business-services.dto.js';

async function requireReader(userId: string): Promise<void> {
  const actor = await businessServicesRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  // This catalog belongs to Security Officer asset-context management. Do not
  // reuse assets.read: other roles only have ownership-scoped asset access.
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer access required');
}
function mapService(
  item: NonNullable<Awaited<ReturnType<typeof businessServicesRepository.findById>>>,
) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    status: item.status.toLowerCase(),
    owner: item.users
      ? {
          id: item.users.id,
          fullName: item.users.full_name,
          inactive: item.users.status !== 'ACTIVE',
        }
      : null,
    linkedAssetsCount: item._count.assets,
    createdAt: item.created_at.toISOString(),
    updatedAt: item.updated_at.toISOString(),
  };
}
function pagination(query: ServicePageQuery, total: number) {
  return { ...query, total, totalPages: Math.ceil(total / query.limit) };
}
export const businessServicesService = {
  async deactivationCheck(userId: string, serviceId: string) {
    await requireReader(userId);
    const result = await businessServicesRepository.deactivationCheck(serviceId);
    return {
      service: mapService(result.service),
      activeAssetsCount: result.activeAssetsCount,
      unresolvedRisksCount: result.unresolvedRisksCount,
      canDeactivate:
        result.service.status === 'ACTIVE' &&
        result.activeAssetsCount === 0 &&
        result.unresolvedRisksCount === 0,
    };
  },
  async deactivate(userId: string, serviceId: string, input: DeactivateBusinessServiceInput) {
    await requireReader(userId);
    return mapService(await businessServicesRepository.deactivate(userId, serviceId, input));
  },
  async update(userId: string, serviceId: string, input: UpdateBusinessServiceInput) {
    await requireReader(userId);
    return mapService(await businessServicesRepository.update(userId, serviceId, input));
  },
  async create(userId: string, input: CreateBusinessServiceInput) {
    await requireReader(userId);
    return mapService(await businessServicesRepository.create(userId, input));
  },
  async ownerOptions(userId: string, q?: string) {
    await requireReader(userId);
    return {
      items: (await businessServicesRepository.ownerOptions(q)).map((item) => ({
        id: item.id,
        fullName: item.full_name,
        role: item.role,
      })),
    };
  },
  async list(userId: string, query: ListBusinessServicesQuery) {
    await requireReader(userId);
    const [total, items] = await businessServicesRepository.list(query);
    return {
      items: items.map(mapService),
      pagination: pagination({ page: query.page, limit: query.limit }, total),
    };
  },
  async get(userId: string, serviceId: string) {
    await requireReader(userId);
    const item = await businessServicesRepository.findById(serviceId);
    if (!item) throw new AppError(404, 'BUSINESS_SERVICE_NOT_FOUND', 'Business service not found');
    return mapService(item);
  },
  async listAssets(userId: string, serviceId: string, query: ServicePageQuery) {
    await requireReader(userId);
    if (!(await businessServicesRepository.findById(serviceId))) {
      throw new AppError(404, 'BUSINESS_SERVICE_NOT_FOUND', 'Business service not found');
    }
    const [total, items] = await businessServicesRepository.listAssets(serviceId, query);
    return {
      items: items.map((item) => ({
        id: item.id,
        assetCode: item.asset_code,
        name: item.name,
        assetType: item.asset_type,
        status: item.status.toLowerCase(),
      })),
      pagination: pagination(query, total),
    };
  },
};

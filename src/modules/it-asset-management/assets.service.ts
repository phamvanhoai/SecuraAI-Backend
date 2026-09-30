import { AppError } from '../../common/errors/app-error.js';
import { assetsRepository } from './assets.repository.js';
import type { ListAssetsQuery } from './dto/list-assets.dto.js';
import type { CreateAssetInput } from './dto/create-asset.dto.js';
import type { UpdateAssetInput } from './dto/update-asset.dto.js';
import type { AssignAssetOwnerInput } from './dto/assign-asset-owner.dto.js';
import type { ClassifyAssetInput } from './dto/classify-asset.dto.js';
import type { LinkAssetContextInput } from './dto/link-asset-context.dto.js';
async function activeActor(userId: string) {
  const actor = await assetsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return actor;
}
const person = (item: { id: string; full_name: string; status: string } | null) =>
  item ? { id: item.id, fullName: item.full_name, inactive: item.status !== 'ACTIVE' } : null;
export const assetsService = {
  async linkContext(userId: string, assetId: string, input: LinkAssetContextInput) {
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (item.status === 'ARCHIVED')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be linked');
    if (input.dependencyIds.includes(assetId))
      throw new AppError(422, 'INVALID_ASSET_DEPENDENCY', 'An asset cannot depend on itself');
    const references = await assetsRepository.validateCreateReferences({
      ...(input.businessServiceId ? { businessServiceId: input.businessServiceId } : {}),
      dependencyIds: input.dependencyIds,
      eventSourceIds: input.eventSourceIds,
    });
    if (!references.serviceValid)
      throw new AppError(422, 'INVALID_BUSINESS_SERVICE', 'Selected business service is unavailable');
    if (!references.dependenciesValid)
      throw new AppError(422, 'INVALID_ASSET_DEPENDENCY', 'One or more dependencies are unavailable');
    if (!references.eventSourcesValid)
      throw new AppError(422, 'INVALID_EVENT_SOURCE', 'One or more event sources are unavailable');
    const updated = await assetsRepository.linkContext(assetId, input);
    return { assetId: updated.id, businessServiceId: input.businessServiceId, dependencyIds: input.dependencyIds, eventSourceIds: input.eventSourceIds, linkedAt: updated.updated_at };
  },
  async classify(userId: string, assetId: string, input: ClassifyAssetInput) {
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (item.status === 'ARCHIVED')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be classified');
    const rawScore =
      input.confidentialityImpact * 0.25 +
      input.integrityImpact * 0.25 +
      input.availabilityImpact * 0.3 +
      input.businessImpact * 0.2;
    const score = Math.round((rawScore + Number.EPSILON) * 100) / 100;
    const criticality = score >= 4.5 ? 'critical' : score >= 3.5 ? 'high' : score >= 2.5 ? 'medium' : 'low';
    const updated = await assetsRepository.classify(assetId, criticality, input);
    return {
      assetId,
      previousCriticality: item.criticality,
      criticality: updated.criticality,
      previousDataClassification: item.data_classification,
      dataClassification: updated.data_classification,
      score,
      changed: item.criticality !== updated.criticality || item.data_classification !== updated.data_classification,
      classifiedAt: updated.updated_at,
    };
  },
  async assignOwner(userId: string, assetId: string, input: AssignAssetOwnerInput) { const actor = await activeActor(userId); if (actor.role !== 'SECURITY_OFFICER') throw new AppError(403, 'FORBIDDEN', 'Security Officer role required'); const item = await assetsRepository.findById(assetId); if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found'); if (item.status === 'ARCHIVED') throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be reassigned'); if (item.owner_user_id === input.ownerUserId) return { assetId, previousOwner: person(item.users_assets_owner_user_idTousers), owner: person(item.users_assets_owner_user_idTousers), changed: false, assignedAt: null }; if (input.ownerUserId) { const references = await assetsRepository.validateCreateReferences({ ownerUserId: input.ownerUserId, dependencyIds: [], eventSourceIds: [] }); if (!references.ownerValid) throw new AppError(422, 'INVALID_ASSET_OWNER', 'Selected asset owner is unavailable'); } const updated = await assetsRepository.assignOwner(assetId, input.ownerUserId); return { assetId, previousOwner: person(item.users_assets_owner_user_idTousers), owner: person(updated.users_assets_owner_user_idTousers), changed: true, assignedAt: updated.updated_at }; },
  async archive(userId: string, assetId: string) { const actor = await activeActor(userId); if (actor.role !== 'SECURITY_OFFICER') throw new AppError(403, 'FORBIDDEN', 'Security Officer role required'); const item = await assetsRepository.findById(assetId); if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found'); if (item.status === 'ARCHIVED') throw new AppError(409, 'ASSET_ALREADY_ARCHIVED', 'Asset is already archived'); await assetsRepository.archive(assetId); },
  async update(userId: string, assetId: string, input: UpdateAssetInput) {
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER') throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const existing = await assetsRepository.findById(assetId);
    if (!existing) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (existing.status === 'ARCHIVED') throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be edited');
    const item = await assetsRepository.update(assetId, input);
    return { id: item.id, assetCode: item.asset_code, name: item.name, assetType: item.asset_type, criticality: item.criticality, dataClassification: item.data_classification, description: item.description, status: item.status.toLowerCase(), owner: person(item.users_assets_owner_user_idTousers), businessService: item.business_services ? { id: item.business_services.id, name: item.business_services.name, inactive: item.business_services.status !== 'ACTIVE' } : null, createdAt: item.created_at, updatedAt: item.updated_at };
  },
  async createOptions(userId: string) {
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const [owners, businessServices, assets, eventSources] =
      await assetsRepository.findCreateOptions();
    return {
      owners: owners.map((item) => ({ id: item.id, fullName: item.full_name, role: item.role })),
      businessServices,
      assets: assets.map((item) => ({ id: item.id, assetCode: item.asset_code, name: item.name })),
      eventSources: eventSources.map((item) => ({
        id: item.id,
        name: item.name,
        sourceType: item.source_type,
      })),
    };
  },
  async create(userId: string, input: CreateAssetInput) {
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const references = await assetsRepository.validateCreateReferences({
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.businessServiceId ? { businessServiceId: input.businessServiceId } : {}),
      dependencyIds: input.dependencies.map((item) => item.assetId),
      eventSourceIds: input.eventSourceIds,
    });
    if (!references.ownerValid)
      throw new AppError(422, 'INVALID_ASSET_OWNER', 'Selected asset owner is unavailable');
    if (!references.serviceValid)
      throw new AppError(
        422,
        'INVALID_BUSINESS_SERVICE',
        'Selected business service is unavailable',
      );
    if (!references.dependenciesValid)
      throw new AppError(
        422,
        'INVALID_ASSET_DEPENDENCY',
        'One or more dependencies are unavailable',
      );
    if (!references.eventSourcesValid)
      throw new AppError(422, 'INVALID_EVENT_SOURCE', 'One or more event sources are unavailable');
    try {
      const item = await assetsRepository.create(userId, input);
      return {
        id: item.id,
        assetCode: item.asset_code,
        name: item.name,
        assetType: item.asset_type,
        criticality: item.criticality.toLowerCase(),
        dataClassification: item.data_classification.toLowerCase(),
        description: item.description,
        status: item.status.toLowerCase(),
        owner: person(item.users_assets_owner_user_idTousers),
        businessService: item.business_services
          ? {
              id: item.business_services.id,
              name: item.business_services.name,
              inactive: item.business_services.status !== 'ACTIVE',
            }
          : null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppError(409, 'ASSET_CODE_EXISTS', 'Asset code already exists');
      throw error;
    }
  },
  async list(userId: string, query: ListAssetsQuery) {
    const actor = await activeActor(userId);
    const scopedQuery =
      actor.role === 'SECURITY_OFFICER' ? query : { ...query, ownerUserId: userId };
    const [total, records] = await assetsRepository.list(scopedQuery);
    return {
      items: records.map((item) => ({
        id: item.id,
        assetCode: item.asset_code,
        name: item.name,
        assetType: item.asset_type,
        criticality: item.criticality.toLowerCase(),
        dataClassification: item.data_classification.toLowerCase(),
        description: item.description,
        status: item.status.toLowerCase(),
        owner: person(item.users_assets_owner_user_idTousers),
        businessService: item.business_services
          ? {
              id: item.business_services.id,
              name: item.business_services.name,
              inactive: item.business_services.status !== 'ACTIVE',
            }
          : null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async get(userId: string, assetId: string) {
    const actor = await activeActor(userId);
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (actor.role !== 'SECURITY_OFFICER' && item.owner_user_id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'Asset Owner access required');
    return {
      id: item.id,
      assetCode: item.asset_code,
      name: item.name,
      assetType: item.asset_type,
      criticality: item.criticality,
      dataClassification: item.data_classification,
      description: item.description,
      status: item.status.toLowerCase(),
      archivedAt: item.archived_at,
      owner: person(item.users_assets_owner_user_idTousers),
      createdBy: person(item.users_assets_created_byTousers),
      businessService: item.business_services
        ? {
            id: item.business_services.id,
            name: item.business_services.name,
            inactive: item.business_services.status !== 'ACTIVE',
          }
        : null,
      dependencies: item.asset_dependencies_asset_dependencies_asset_idToassets.map((link) => ({
        id: link.id,
        type: link.dependency_type,
        description: link.description,
        asset: {
          id: link.assets_asset_dependencies_depends_on_asset_idToassets.id,
          assetCode: link.assets_asset_dependencies_depends_on_asset_idToassets.asset_code,
          name: link.assets_asset_dependencies_depends_on_asset_idToassets.name,
          status: link.assets_asset_dependencies_depends_on_asset_idToassets.status.toLowerCase(),
        },
      })),
      controls: item.control_asset_links.map(({ security_controls: control }) => ({
        id: control.id,
        code: control.control_code,
        name: control.name,
        implementationStatus: control.implementation_status.toLowerCase(),
      })),
      eventSources: item.asset_event_sources.map(({ event_sources: source }) => ({
        id: source.id,
        name: source.name,
        sourceType: source.source_type,
        status: source.status.toLowerCase(),
      })),
      risks: item.risk_assets.map(({ risks: risk }) => ({
        id: risk.id,
        code: risk.risk_code,
        title: risk.title,
        status: risk.status.toLowerCase(),
      })),
      incidents: item.incident_assets.map(({ incidents: incident }) => ({
        id: incident.id,
        code: incident.incident_code,
        title: incident.title,
        severity: incident.severity,
        status: incident.status.toLowerCase(),
      })),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  },
};

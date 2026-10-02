import { AppError } from '../../common/errors/app-error.js';
import { assetsRepository } from './assets.repository.js';
import { ASSET_CLASSIFICATION_METHOD, calculateAssetCriticality } from './asset-classification-method.js';
import type { ListAssetsQuery } from './dto/list-assets.dto.js';
import type { CreateAssetInput } from './dto/create-asset.dto.js';
import type { UpdateAssetInput } from './dto/update-asset.dto.js';
import type { AssignAssetOwnerInput } from './dto/assign-asset-owner.dto.js';
import type { ArchiveAssetInput } from './dto/archive-asset.dto.js';
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
    let result;
    try {
      result = await assetsRepository.linkContext(assetId, input, userId);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2028')
        throw new AppError(503, 'ASSET_CONTEXT_TRANSACTION_UNAVAILABLE', 'Saving asset links could not complete in time. Please try again.');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')
        throw new AppError(409, 'ASSET_CONTEXT_CONFLICT', 'Asset context changed concurrently. Reload and try again.');
      throw error;
    }
    if (result.kind === 'forbidden') throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
    if (result.kind === 'not_found') throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (result.kind === 'archived') throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be linked');
    if (result.kind === 'invalid_service') throw new AppError(422, 'INVALID_BUSINESS_SERVICE', 'New business service must be active');
    if (result.kind === 'invalid_dependency') throw new AppError(422, 'INVALID_ASSET_DEPENDENCY', 'New dependencies must be active');
    if (result.kind === 'invalid_source') throw new AppError(422, 'INVALID_EVENT_SOURCE', 'New event sources must be active');
    if (result.kind === 'cycle') throw new AppError(422, 'ASSET_DEPENDENCY_CYCLE', 'These dependencies create a cycle back to this asset. Remove the circular dependency and try again.');
    return { assetId: result.asset.id, businessServiceId: input.businessServiceId, dependencyIds: input.dependencyIds, eventSourceIds: input.eventSourceIds, linkedAt: result.asset.updated_at };
  },
  async classify(userId: string, assetId: string, input: ClassifyAssetInput) {
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (item.status === 'ARCHIVED')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be classified');
    const { score, criticality } = calculateAssetCriticality(input);
    let result;
    try {
      result = await assetsRepository.classify(assetId, criticality, input, userId, ASSET_CLASSIFICATION_METHOD);
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')
        throw new AppError(409, 'ASSET_CLASSIFICATION_CONFLICT', 'Asset changed concurrently. Reload and try again.');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2028')
        throw new AppError(503, 'ASSET_CLASSIFICATION_UNAVAILABLE', 'Classification could not complete in time. Please try again.');
      throw error;
    }
    if (result.kind === 'forbidden') throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
    if (result.kind === 'not_found') throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (result.kind === 'archived') throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be classified');
    const updated = result.asset;
    return {
      assetId,
      previousCriticality: result.previous.criticality.toLowerCase(),
      criticality: updated.criticality,
      previousDataClassification: result.previous.data_classification.toLowerCase(),
      dataClassification: updated.data_classification,
      score,
      changed: result.previous.criticality.toLowerCase() !== updated.criticality || result.previous.data_classification.toLowerCase() !== updated.data_classification,
      methodVersion: ASSET_CLASSIFICATION_METHOD,
      classifiedAt: updated.classified_at,
    };
  },
  async assignOwner(userId: string, assetId: string, input: AssignAssetOwnerInput) { const actor = await activeActor(userId); if (actor.role !== 'SECURITY_OFFICER') throw new AppError(403, 'FORBIDDEN', 'Security Officer role required'); const item = await assetsRepository.findById(assetId); if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found'); if (item.status === 'ARCHIVED') throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be reassigned'); if (item.owner_user_id === input.ownerUserId) return { assetId, previousOwner: person(item.users_assets_owner_user_idTousers), owner: person(item.users_assets_owner_user_idTousers), changed: false, assignedAt: null }; if (input.ownerUserId) { const references = await assetsRepository.validateCreateReferences({ ownerUserId: input.ownerUserId, dependencyIds: [], eventSourceIds: [] }); if (!references.ownerValid) throw new AppError(422, 'INVALID_ASSET_OWNER', 'Selected asset owner is unavailable'); } const updated = await assetsRepository.assignOwner(assetId, input.ownerUserId); return { assetId, previousOwner: person(item.users_assets_owner_user_idTousers), owner: person(updated.users_assets_owner_user_idTousers), changed: true, assignedAt: updated.updated_at }; },
  async archive(userId: string, assetId: string, input: ArchiveAssetInput, correlationId: string | null = null) {
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER') throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    let result;
    try { result = await assetsRepository.archive(assetId, userId, input.reason, correlationId); }
    catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') throw new AppError(409, 'ASSET_ARCHIVE_CONFLICT', 'Asset or dependencies changed concurrently. Reload and try again.');
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2028') throw new AppError(503, 'ASSET_ARCHIVE_UNAVAILABLE', 'Archiving could not complete in time. Please try again.');
      throw error;
    }
    if (result.kind === 'forbidden') throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
    if (result.kind === 'not_found') throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (result.kind === 'archived') throw new AppError(409, 'ASSET_ALREADY_ARCHIVED', 'Asset is already archived. Reload the list.');
    if (result.kind === 'dependencies') {
      const names = result.dependencies.map((link) => `${link.assets_asset_dependencies_asset_idToassets.asset_code} — ${link.assets_asset_dependencies_asset_idToassets.name}`).join('; ');
      throw new AppError(409, 'ASSET_HAS_ACTIVE_DEPENDENCIES', `Cannot archive: ${result.count} active asset(s) depend on this asset: ${names}${result.count > 20 ? '; additional assets not shown' : ''}. Resolve or replace their dependencies first.`);
    }
  },
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
      archivedBy: person(item.archive_actor),
      archiveReason: item.archive_reason,
      classification: item.classified_at ? {
        confidentialityImpact: item.classification_confidentiality_impact,
        integrityImpact: item.classification_integrity_impact,
        availabilityImpact: item.classification_availability_impact,
        businessImpact: item.classification_business_impact,
        rationale: item.classification_rationale,
        dataClassificationBasis: item.data_classification_basis,
        dataClassificationMethodVersion: item.data_classification_method_version,
        methodVersion: item.classification_method_version,
        assessedAt: item.classified_at,
        assessedBy: person(item.classification_assessor),
      } : null,
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

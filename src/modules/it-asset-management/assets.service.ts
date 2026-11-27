import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { assetsRepository } from './assets.repository.js';
import {
  ASSET_CLASSIFICATION_METHOD,
  calculateAssetCriticality,
} from './asset-classification-method.js';
import type { ListAssetsQuery } from './dto/list-assets.dto.js';
import type { CreateAssetInput } from './dto/create-asset.dto.js';
import type { UpdateAssetInput } from './dto/update-asset.dto.js';
import type { AssignAssetOwnerInput } from './dto/assign-asset-owner.dto.js';
import type { ArchiveAssetInput } from './dto/archive-asset.dto.js';
import type { ClassifyAssetInput } from './dto/classify-asset.dto.js';
import { assetClassificationSnapshotSchema } from './dto/classify-asset.dto.js';
import type { LinkAssetContextInput } from './dto/link-asset-context.dto.js';
import {
  assetContextSnapshotSchema,
  type AssetContextHistoryQuery,
} from './dto/link-asset-context.dto.js';
// Load the current user and reject missing or inactive accounts.
async function activeActor(userId: string) {
  const actor = await assetsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return actor;
}
// Return a small user summary, or null when no user is linked.
const person = (item: { id: string; full_name: string; status: string } | null) =>
  item ? { id: item.id, fullName: item.full_name, inactive: item.status !== 'ACTIVE' } : null;
// Build an asset code from a random UUID. The database checks that it is unique.
const generateAssetCode = () => `AST-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
// Apply asset rules, call the repository and prepare data for the controller.
export const assetsService = {
  // Get classification history. The repository checks who can view this asset.
  async classificationHistory(userId: string, assetId: string, query: AssetContextHistoryQuery) {
    const { total, items } = await assetsRepository.classificationHistory(assetId, userId, query);
    return {
      // Read saved before/after data. Return null if an old snapshot has an unsupported format.
      items: items.map((item) => ({
        id: item.id,
        occurredAt: item.occurred_at,
        actor: item.users ? { id: item.users.id, fullName: item.users.full_name } : null,
        before: assetClassificationSnapshotSchema.safeParse(item.before_data).data ?? null,
        after: assetClassificationSnapshotSchema.safeParse(item.after_data).data ?? null,
      })),
      // Return page details and calculate the total number of pages.
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  // Get link history. The repository checks who can view this asset.
  async contextHistory(userId: string, assetId: string, query: AssetContextHistoryQuery) {
    const { total, items } = await assetsRepository.contextHistory(assetId, userId, query);
    return {
      // Read saved before/after data. Return null if an old snapshot has an unsupported format.
      items: items.map((item) => ({
        id: item.id,
        occurredAt: item.occurred_at,
        actor: item.users ? { id: item.users.id, fullName: item.users.full_name } : null,
        before: assetContextSnapshotSchema.safeParse(item.before_data).data ?? null,
        after: assetContextSnapshotSchema.safeParse(item.after_data).data ?? null,
      })),
      // Return page details and calculate the total number of pages.
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  // Find dependency choices and mark choices that would create a cycle.
  async dependencyOptions(userId: string, assetId: string, q: string) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    // Do not offer new links for a missing or archived asset.
    const asset = await assetsRepository.findById(assetId);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (asset.status !== 'ACTIVE')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be linked');
    // These choices help the form. The save action still checks for cycles again.
    return { items: await assetsRepository.dependencyOptions(assetId, q) };
  },
  // Update the business service, dependencies and event sources of an active asset.
  async linkContext(userId: string, assetId: string, input: LinkAssetContextInput) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    // Check that the asset exists and has not been archived.
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (item.status === 'ARCHIVED')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be linked');
    // An asset cannot depend on itself.
    if (input.dependencyIds.includes(assetId))
      throw new AppError(422, 'INVALID_ASSET_DEPENDENCY', 'An asset cannot depend on itself');
    let result;
    try {
      // The repository checks current data and saves links and history together.
      result = await assetsRepository.linkContext(assetId, input, userId);
    } catch (error: unknown) {
      // Map known transaction errors to messages the user can act on.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2028')
        throw new AppError(
          503,
          'ASSET_CONTEXT_TRANSACTION_UNAVAILABLE',
          'Saving asset links could not complete in time. Please try again.',
        );
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')
        throw new AppError(
          409,
          'ASSET_CONTEXT_CONFLICT',
          'Asset context changed concurrently. Reload and try again.',
        );
      // Keep other errors unchanged for the shared error handler.
      throw error;
    }
    // Turn failed checks from the transaction into API errors.
    if (result.kind === 'forbidden')
      throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
    if (result.kind === 'not_found') throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (result.kind === 'archived')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be linked');
    if (result.kind === 'invalid_service')
      throw new AppError(422, 'INVALID_BUSINESS_SERVICE', 'New business service must be active');
    if (result.kind === 'invalid_dependency')
      throw new AppError(422, 'INVALID_ASSET_DEPENDENCY', 'New dependencies must be active');
    if (result.kind === 'invalid_source')
      throw new AppError(422, 'INVALID_EVENT_SOURCE', 'New event sources must be active');
    // Include the cycle path so the form can explain which links cause the loop.
    if (result.kind === 'cycle')
      throw new AppError(
        422,
        'ASSET_DEPENDENCY_CYCLE',
        'Cannot save dependencies because they create a circular dependency. Remove the dependency causing the loop or review its existing dependencies.',
        { path: result.path },
      );
    // Return the saved link choices and the asset update time.
    return {
      assetId: result.asset.id,
      businessServiceId: input.businessServiceId,
      dependencyIds: input.dependencyIds,
      eventSourceIds: input.eventSourceIds,
      linkedAt: result.asset.updated_at,
    };
  },
  // Calculate criticality and save it with the selected data classification.
  async classify(userId: string, assetId: string, input: ClassifyAssetInput) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (item.status === 'ARCHIVED')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be classified');
    // Use the highest impact score to calculate criticality. Data classification is selected by the user.
    const { score, criticality } = calculateAssetCriticality(input);
    let result;
    try {
      // Save the scores, reasons, method and acting user through the repository.
      result = await assetsRepository.classify(
        assetId,
        criticality,
        input,
        userId,
        ASSET_CLASSIFICATION_METHOD,
      );
    } catch (error: unknown) {
      // Map known transaction errors to messages the user can act on.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')
        throw new AppError(
          409,
          'ASSET_CLASSIFICATION_CONFLICT',
          'Asset changed concurrently. Reload and try again.',
        );
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2028')
        throw new AppError(
          503,
          'ASSET_CLASSIFICATION_UNAVAILABLE',
          'Classification could not complete in time. Please try again.',
        );
      // Keep other errors unchanged for the shared error handler.
      throw error;
    }
    // The repository checks access and asset status again inside the transaction.
    if (result.kind === 'forbidden')
      throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
    if (result.kind === 'not_found') throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (result.kind === 'archived')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be classified');
    const updated = result.asset;
    return {
      assetId,
      previousCriticality: result.previous.criticality?.toLowerCase() ?? null,
      criticality: updated.criticality,
      previousDataClassification: result.previous.data_classification?.toLowerCase() ?? null,
      dataClassification: updated.data_classification,
      score,
      // This flag compares the two levels only, not the reasons or individual impact scores.
      changed:
        result.previous.criticality?.toLowerCase() !== updated.criticality ||
        result.previous.data_classification?.toLowerCase() !== updated.data_classification,
      methodVersion: ASSET_CLASSIFICATION_METHOD,
      classifiedAt: updated.classified_at,
    };
  },
  // Assign, replace or remove the owner of an active asset.
  async assignOwner(userId: string, assetId: string, input: AssignAssetOwnerInput) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (item.status === 'ARCHIVED')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be reassigned');
    // If the owner is unchanged, return without saving a new assignment.
    if (item.owner_user_id === input.ownerUserId)
      return {
        assetId,
        previousOwner: person(item.users_assets_owner_user_idTousers),
        owner: person(item.users_assets_owner_user_idTousers),
        changed: false,
        assignedAt: null,
      };
    // A new owner must be eligible. A null owner means remove the assignment.
    if (input.ownerUserId) {
      const references = await assetsRepository.validateCreateReferences({
        ownerUserId: input.ownerUserId,
      });
      if (!references.ownerValid)
        throw new AppError(422, 'INVALID_ASSET_OWNER', 'Selected asset owner is unavailable');
    }
    // The repository also checks a new owner before saving.
    const updated = await assetsRepository.assignOwner(assetId, input.ownerUserId);
    return {
      assetId,
      previousOwner: person(item.users_assets_owner_user_idTousers),
      owner: person(updated.users_assets_owner_user_idTousers),
      changed: true,
      assignedAt: updated.updated_at,
    };
  },
  // Archive an asset while keeping its record, links and history.
  async archive(
    userId: string,
    assetId: string,
    input: ArchiveAssetInput,
    correlationId: string | null = null,
  ) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    let result;
    try {
      // The repository checks the code, status and active dependents before saving and recording history.
      result = await assetsRepository.archive(
        assetId,
        userId,
        input.reason,
        correlationId,
        input.confirmationCode,
      );
    } catch (error: unknown) {
      // Map known transaction errors to messages the user can act on.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034')
        throw new AppError(
          409,
          'ASSET_ARCHIVE_CONFLICT',
          'Asset or dependencies changed concurrently. Reload and try again.',
        );
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2028')
        throw new AppError(
          503,
          'ASSET_ARCHIVE_UNAVAILABLE',
          'Archiving could not complete in time. Please try again.',
        );
      // Keep other errors unchanged for the shared error handler.
      throw error;
    }
    if (result.kind === 'forbidden')
      throw new AppError(403, 'FORBIDDEN', 'Active Security Officer required');
    if (result.kind === 'not_found') throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    // The confirmation code must match the stored asset code.
    if (result.kind === 'confirmation_mismatch')
      throw new AppError(
        422,
        'ASSET_CONFIRMATION_MISMATCH',
        'Asset code does not match. Enter the exact asset code to confirm archive.',
      );
    if (result.kind === 'archived')
      throw new AppError(
        409,
        'ASSET_ALREADY_ARCHIVED',
        'Asset is already archived. Reload the list.',
      );
    // Show the active assets that must stop depending on this asset before archive.
    if (result.kind === 'dependencies') {
      const names = result.dependencies
        .map(
          (link) =>
            `${link.assets_asset_dependencies_asset_idToassets.asset_code} — ${link.assets_asset_dependencies_asset_idToassets.name}`,
        )
        .join('; ');
      throw new AppError(
        409,
        'ASSET_HAS_ACTIVE_DEPENDENCIES',
        `Cannot archive: ${result.count} active asset(s) depend on this asset: ${names}${result.count > 20 ? '; additional assets not shown' : ''}. Resolve or replace their dependencies first.`,
      );
    }
  },
  // Edit basic asset details. Other changes use their own actions.
  async update(userId: string, assetId: string, input: UpdateAssetInput) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    // Archived assets are read-only.
    const existing = await assetsRepository.findById(assetId);
    if (!existing) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (existing.status === 'ARCHIVED')
      throw new AppError(409, 'ASSET_ARCHIVED', 'Archived assets cannot be edited');
    // Save only the basic details allowed by the edit input.
    const item = await assetsRepository.update(assetId, input);
    return {
      id: item.id,
      assetCode: item.asset_code,
      name: item.name,
      assetType: item.asset_type,
      criticality: item.criticality,
      dataClassification: item.data_classification,
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
  },
  // Search eligible owners by name or email for the owner picker.
  async ownerOptions(userId: string, q: string) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    return {
      items: (await assetsRepository.ownerOptions(q)).map((item) => ({
        id: item.id,
        fullName: item.full_name,
        email: item.email,
      })),
    };
  },
  // Get reference choices used by asset forms.
  async createOptions(userId: string) {
    // Only an active Security Officer can perform this action.
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
  // Create an asset with a generated code and an optional eligible owner.
  async create(userId: string, input: CreateAssetInput) {
    // Only an active Security Officer can perform this action.
    const actor = await activeActor(userId);
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    // Check the optional owner. Links and classification are added after creation.
    const references = await assetsRepository.validateCreateReferences({
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
    });
    if (!references.ownerValid)
      throw new AppError(422, 'INVALID_ASSET_OWNER', 'Selected asset owner is unavailable');
    try {
      // Generate the code on the server, then save the new asset.
      const item = await assetsRepository.create(userId, generateAssetCode(), input);
      return {
        id: item.id,
        assetCode: item.asset_code,
        name: item.name,
        assetType: item.asset_type,
        criticality: item.criticality?.toLowerCase() ?? null,
        dataClassification: item.data_classification?.toLowerCase() ?? null,
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
      // P2002 is a database unique-key conflict. Ask the user to retry code generation.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppError(
          409,
          'ASSET_CODE_GENERATION_CONFLICT',
          'Unable to allocate a unique asset code. Please retry.',
        );
      throw error;
    }
  },
  // Get a page of assets within the current user's access scope.
  async list(userId: string, query: ListAssetsQuery) {
    const actor = await activeActor(userId);
    // Security Officers use the requested filters. Other users only see assets they own.
    const scopedQuery =
      actor.role === 'SECURITY_OFFICER' ? query : { ...query, ownerUserId: userId };
    // Get both the matching total and the records for this page.
    const [total, records] = await assetsRepository.list(scopedQuery);
    return {
      items: records.map((item) => ({
        id: item.id,
        assetCode: item.asset_code,
        name: item.name,
        assetType: item.asset_type,
        criticality: item.criticality?.toLowerCase() ?? null,
        dataClassification: item.data_classification?.toLowerCase() ?? null,
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
      // Use the matching total to calculate the number of pages.
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  // Get one asset and its related records, only if the user can view it.
  async get(userId: string, assetId: string) {
    const actor = await activeActor(userId);
    const item = await assetsRepository.findById(assetId);
    if (!item) throw new AppError(404, 'ASSET_NOT_FOUND', 'Asset not found');
    // Only a Security Officer or this asset's owner can view its details.
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
      // Show the assessment details only when a classification has been recorded.
      classification: item.classified_at
        ? {
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
          }
        : null,
      owner: person(item.users_assets_owner_user_idTousers),
      createdBy: person(item.users_assets_created_byTousers),
      businessService: item.business_services
        ? {
            id: item.business_services.id,
            name: item.business_services.name,
            inactive: item.business_services.status !== 'ACTIVE',
          }
        : null,
      // Return linked assets, controls, event sources, risks and incidents for the detail view.
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

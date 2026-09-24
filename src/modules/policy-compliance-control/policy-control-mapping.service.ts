import { AppError } from '../../common/errors/app-error.js';
import type {
  FrameworkControlsQuery,
  ListPolicyControlMappingsQuery,
  ReplacePolicyControlMappingsInput,
} from './dto/map-controls.dto.js';
import { policyControlMappingRepository as repository } from './policy-control-mapping.repository.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

const requirePermission = (actor: Actor): void => {
  if (!actor.permissions.includes('compliance.map-controls')) {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
};

export const policyControlMappingService = {
  async list(query: ListPolicyControlMappingsQuery, actor: Actor) {
    requirePermission(actor);
    const result = await repository.listPublishedVersions(query);
    return {
      items: result.items.map((version) => ({
        policyId: version.policies.policy_id,
        policyCode: version.policies.policy_code,
        title: version.policies.title,
        versionId: version.policy_version_id,
        versionNumber: version.version_number,
        publishedAt: version.published_at?.toISOString() ?? null,
        mappings: version.policy_control_mappings.map((mapping) => ({
          controlId: mapping.compliance_controls.compliance_control_id,
          controlCode: mapping.compliance_controls.control_code,
          controlTitle: mapping.compliance_controls.title,
          notes: mapping.notes,
          framework: {
            id: mapping.compliance_controls.compliance_frameworks.compliance_framework_id,
            code: mapping.compliance_controls.compliance_frameworks.code,
            name: mapping.compliance_controls.compliance_frameworks.name,
            version: mapping.compliance_controls.compliance_frameworks.version,
          },
        })),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async listFrameworks(actor: Actor) {
    requirePermission(actor);
    const frameworks = await repository.listFrameworks();
    return frameworks.map((framework) => ({
      id: framework.compliance_framework_id,
      code: framework.code,
      name: framework.name,
      version: framework.version,
      description: framework.description,
      controlCount: framework._count.compliance_controls,
    }));
  },

  async listFrameworkControls(frameworkId: string, query: FrameworkControlsQuery, actor: Actor) {
    requirePermission(actor);
    const result = await repository.listFrameworkControls(frameworkId, query);
    if (!result.framework) {
      throw new AppError(
        404,
        'COMPLIANCE_FRAMEWORK_NOT_FOUND',
        'Compliance framework was not found',
      );
    }
    return {
      items: result.items.map((control) => ({
        id: control.compliance_control_id,
        code: control.control_code,
        title: control.title,
        description: control.description,
        parentControlId: control.parent_compliance_control_id,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async replace(
    policyId: string,
    versionId: string,
    frameworkId: string,
    input: ReplacePolicyControlMappingsInput,
    actor: Actor,
    context: RequestContext,
  ) {
    requirePermission(actor);
    return repository.transaction(async (database) => {
      const version = await repository.findPublishedVersion(database, policyId, versionId);
      if (!version) {
        throw new AppError(
          404,
          'PUBLISHED_POLICY_VERSION_NOT_FOUND',
          'Published policy version was not found',
        );
      }
      const framework = await repository.findFramework(database, frameworkId);
      if (!framework) {
        throw new AppError(
          404,
          'COMPLIANCE_FRAMEWORK_NOT_FOUND',
          'Compliance framework was not found',
        );
      }
      const controlIds = input.mappings.map((mapping) => mapping.controlId);
      const validCount =
        controlIds.length === 0
          ? 0
          : await repository.countFrameworkControls(database, frameworkId, controlIds);
      if (validCount !== controlIds.length) {
        throw new AppError(
          422,
          'INVALID_FRAMEWORK_CONTROLS',
          'Every selected control must belong to the selected framework',
        );
      }
      const before = await repository.listExistingFrameworkMappings(
        database,
        versionId,
        frameworkId,
      );
      await repository.replaceFrameworkMappings(database, versionId, frameworkId, input.mappings);
      await repository.createAudit(database, {
        actorUserId: actor.userId,
        policyId,
        versionId,
        frameworkId,
        before,
        after: input.mappings,
        ...context,
      });
      return {
        policyId,
        policyCode: version.policies.policy_code,
        versionId,
        frameworkId,
        mappings: input.mappings,
      };
    });
  },
} as const;

import { AppError } from '../../common/errors/app-error.js';
import type { CreatePolicyVersionBody } from './dto/create-policy-version.dto.js';
import type { ReviewablePolicyDraftQuery } from './dto/view-policy-draft.dto.js';
import type { ListPolicyDraftsQuery } from './dto/list-policy-drafts.dto.js';
import type { EditPolicyDraftBody } from './dto/edit-policy-draft.dto.js';
import { Prisma } from '@prisma/client';
import type { RequestPolicyRevisionBody } from './dto/request-policy-revision.dto.js';
import type { RejectPolicyBody, RejectedPolicyQuery } from './dto/reject-policy.dto.js';
import type { PublishedPolicyListQuery } from './dto/view-published-policy.dto.js';
import type { CreatePolicyDraftBody } from './dto/create-policy-draft.dto.js';
import type { PolicyVersionHistoryQuery } from './dto/policy-version-history.dto.js';
import type { DefinePolicyApplicabilityBody } from './dto/define-policy-applicability.dto.js';
import {
  policyComplianceRepository,
  type PolicyReviewRecord,
  type ReviewablePolicyRecord,
  type OwnedPolicyDraftRecord,
  type PolicyDraftForSubmission,
  type RejectedPolicyDecisionRecord,
  type PolicyVersionHistoryRecord,
} from './policy-compliance.repository.js';

// Map PolicyVersionHistory database fields into the API response.
function mapPolicyVersionHistory(version: PolicyVersionHistoryRecord) {
  const policy = version.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: version.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    versionId: version.id,
    versionNumber: version.version_number,
    changeSummary: version.change_summary,
    status: version.status === 'SUPERSEDED' ? 'archived' : 'published',
    effectiveDate: version.published_at,
    createdAt: version.created_at,
    publishedAt: version.published_at,
    createdBy: { id: version.users.id, name: version.users.full_name },
    // V2 stores the publication timestamp but does not store the publishing actor.
    publishedBy: null,
  };
}

// Map RejectedPolicy database fields into the API response.
function mapRejectedPolicy(decision: RejectedPolicyDecisionRecord) {
  const version = decision.policy_versions;
  const policy = version.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: version.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    ownerUserId: policy.owner_user_id,
    version: {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status.toLowerCase(),
    },
    rejection: {
      id: decision.id,
      reason: decision.comment ?? '',
      rejectedByUserId: decision.actor_user_id,
      rejectedByName: decision.users.full_name,
      rejectedAt: decision.decided_at,
    },
  };
}

// Map the submitted version and parent policy into the submission response.
function toSubmittedDraft(version: PolicyDraftForSubmission) {
  const policy = version.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: policy.id,
    policyCode: policy.policy_code,
    title: policy.title,
    policyStatus: policy.status,
    ownerUserId: policy.owner_user_id,
    version: {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status,
      createdByUserId: version.author_user_id,
      createdAt: version.created_at,
    },
    submittedAt: policy.updated_at,
  };
}

// Map OwnedPolicyDraft database fields into the API response.
function mapOwnedPolicyDraft(draft: OwnedPolicyDraftRecord) {
  const policy = draft.policies_policy_versions_policy_idTopolicies;
  const revision = draft.policy_decisions[0];
  return {
    revisionRequest: revision
      ? {
          id: revision.id,
          reason: revision.comment,
          requestedAt: revision.decided_at,
          requestedBy: { id: revision.actor_user_id, name: revision.users.full_name },
        }
      : null,
    policyId: draft.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    ownerUserId: policy.owner_user_id,
    policyStatus: policy.status,
    version: {
      id: draft.id,
      versionNumber: draft.version_number,
      content: draft.content,
      changeSummary: draft.change_summary,
      status: draft.status,
      createdByUserId: draft.author_user_id,
      createdAt: draft.created_at,
    },
    createdAt: policy.created_at,
    updatedAt: policy.updated_at,
  };
}

// Require a currently active Admin account for policy decisions.
async function requireActiveAdmin(userId: string): Promise<void> {
  const actor = await policyComplianceRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Admin role required');
  }
}

// Restrict policy history to active Admins and Security Officers.
async function requirePolicyHistoryViewer(userId: string): Promise<void> {
  const actor = await policyComplianceRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER') {
    throw new AppError(403, 'FORBIDDEN', 'Admin or Security Officer role required');
  }
}

// Map ReviewablePolicy database fields into the API response.
function mapReviewablePolicy(policy: ReviewablePolicyRecord) {
  const version = policy.policy_versions_policy_versions_policy_idTopolicies[0];
  if (!version) throw new Error('Reviewable policy has no submitted version');
  return {
    id: policy.id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    ownerUserId: policy.owner_user_id,
    status: policy.status.toLowerCase(),
    draftVersion: {
      id: version.id,
      versionNumber: version.version_number,
      status: version.status.toLowerCase(),
      createdByUserId: version.author_user_id,
      createdAt: version.created_at,
    },
    updatedAt: policy.updated_at,
  };
}

// Map the selected superseded version previously acknowledged by this Employee.
function mapPreviousAcknowledgement(versions: { id: string; version_number: string; policy_acknowledgements: { acknowledged_at: Date }[] }[]) {
  const previous = versions[0];
  const acknowledgement = previous?.policy_acknowledgements[0];
  return previous && acknowledgement
    ? { versionId: previous.id, versionNumber: previous.version_number, acknowledgedAt: acknowledgement.acknowledged_at }
    : null;
}

// Map PolicyReview database fields into the API response.
function mapPolicyReview(version: PolicyReviewRecord) {
  const policy = version.policies_policy_versions_policy_idTopolicies;
  return {
    policyId: version.policy_id,
    policyCode: policy.policy_code,
    title: policy.title,
    description: policy.description,
    ownerUserId: policy.owner_user_id,
    policyStatus: policy.status.toLowerCase(),
    updatedAt: policy.updated_at,
    version: {
      id: version.id,
      versionNumber: version.version_number,
      content: version.content,
      changeSummary: version.change_summary,
      status: version.status.toLowerCase(),
      effectiveDate: null,
      createdByUserId: version.author_user_id,
      createdAt: version.created_at,
    },
  };
}

export const policyComplianceService = {
  // Read version applicability and department options for the author or policy owner.
  async getApplicability(userId: string, policyId: string, versionId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const draft = await policyComplianceRepository.findOwnedDraftApplicability(policyId, versionId);
    if (!draft) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft not found');
    const policy = draft.policies_policy_versions_policy_idTopolicies;
    if (draft.author_user_id !== userId && policy.owner_user_id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'You can only define applicability for drafts you own');
    const departments = await policyComplianceRepository.listActiveDepartments();
    const value = draft.policy_applicabilities;
    return {
      policyId,
      versionId,
      policyCode: policy.policy_code,
      title: policy.title,
      editable: draft.status === 'DRAFT',
      applicability: value
        ? {
            departmentIds: value.department_ids,
            roleCodes: value.role_codes,
            userGroups: value.user_groups,
            organizationalScope: value.organizational_scope,
            rationale: value.rationale,
            referenceBasis: value.reference_basis,
            definedByUserId: value.defined_by,
            definedAt: value.defined_at,
            updatedAt: value.updated_at,
          }
        : null,
      options: {
        departments,
        roles: ['ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE', 'EMPLOYEE'],
      },
    };
  },

  // Require an editable draft and active selected departments before saving applicability.
  async defineApplicability(
    userId: string,
    policyId: string,
    versionId: string,
    input: DefinePolicyApplicabilityBody,
  ) {
    const current = await this.getApplicability(userId, policyId, versionId);
    if (!current.editable)
      throw new AppError(
        409,
        'POLICY_DRAFT_NOT_EDITABLE',
        'Applicability can only be changed while the version is a draft',
      );
    if (input.departmentIds.length > 0) {
      const count = await policyComplianceRepository.countActiveDepartments(input.departmentIds);
      if (count !== input.departmentIds.length)
        throw new AppError(
          422,
          'INVALID_DEPARTMENTS',
          'Every selected department must exist and be active',
        );
    }
    await policyComplianceRepository.upsertApplicability(versionId, userId, input);
    return this.getApplicability(userId, policyId, versionId);
  },
  // List published and superseded versions for authorized history viewers.
  async listPolicyVersionHistory(userId: string, query: PolicyVersionHistoryQuery) {
    await requirePolicyHistoryViewer(userId);
    const [total, versions] = await policyComplianceRepository.listPolicyVersionHistory(query);
    return {
      canViewDrafts: false,
      items: versions.map(mapPolicyVersionHistory),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Read the content and metadata of one published or superseded version.
  async getPolicyVersionHistory(userId: string, policyId: string, versionId: string) {
    await requirePolicyHistoryViewer(userId);
    const version = await policyComplianceRepository.findPolicyVersionHistory(policyId, versionId);
    if (!version) {
      throw new AppError(404, 'POLICY_VERSION_NOT_FOUND', 'Published policy version not found');
    }
    const summary = mapPolicyVersionHistory(version);
    return {
      policyId: summary.policyId,
      policyCode: summary.policyCode,
      title: summary.title,
      description: summary.description,
      version: {
        id: version.id,
        versionNumber: version.version_number,
        content: version.content,
        changeSummary: version.change_summary,
        status: summary.status,
        effectiveDate: version.published_at,
        createdAt: version.created_at,
        publishedAt: version.published_at,
        createdBy: summary.createdBy,
        publishedBy: summary.publishedBy,
      },
    };
  },

  // Create the next draft while preserving the current published version.
  async createPolicyVersion(userId: string, policyId: string, input: CreatePolicyVersionBody) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    try {
      const { policy, version } = await policyComplianceRepository.createPolicyVersion(
        userId,
        policyId,
        input,
      );
      return {
        policyId: policy.id,
        policyCode: policy.policy_code,
        title: policy.title,
        description: policy.description,
        ownerUserId: policy.owner_user_id,
        policyStatus: policy.status.toLowerCase(),
        version: {
          id: version.id,
          versionNumber: version.version_number,
          content: version.content,
          changeSummary: version.change_summary,
          status: version.status.toLowerCase(),
          createdByUserId: version.author_user_id,
          createdAt: version.created_at,
        },
        updatedAt: policy.updated_at,
      };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          409,
          'POLICY_VERSION_EXISTS',
          'This policy already has the requested version number',
        );
      }
      throw error;
    }
  },

  // Create the policy and its first draft version for the authenticated Security Officer.
  async createPolicyDraft(userId: string, input: CreatePolicyDraftBody) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');

    try {
      const { policy, version } = await policyComplianceRepository.createPolicyDraft(userId, input);
      return {
        id: policy.id,
        policyCode: policy.policy_code,
        title: policy.title,
        description: policy.description,
        ownerUserId: policy.owner_user_id,
        status: policy.status,
        currentVersion: {
          id: version.id,
          versionNumber: version.version_number,
          content: version.content,
          status: version.status,
          createdAt: version.created_at,
        },
        createdAt: policy.created_at,
        updatedAt: policy.updated_at,
      };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'POLICY_CODE_EXISTS', 'Policy code already exists');
      }
      throw error;
    }
  },

  // Read owned publications and whether another version is already in progress.
  async listOwnedPublishedPolicies(userId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const policies = await policyComplianceRepository.listOwnedPublishedPolicies(userId);
    return policies.map((policy) => {
      const version = policy.policy_versions_policies_current_published_version_idTopolicy_versions;
      if (!version) throw new Error('Published policy has no current published version');
      return {
        id: policy.id,
        policyCode: policy.policy_code,
        title: policy.title,
        description: policy.description,
        currentVersion: version.version_number,
        content: version.content,
        changeSummary: version.change_summary,
        publishedAt: version.published_at,
        updatedAt: policy.updated_at,
        eligibleForNewVersion:
          policy.policy_versions_policy_versions_policy_idTopolicies.length === 0,
      };
    });
  },

  // Read current publications with this Employee's version-specific acknowledgements.
  async listPublishedPoliciesForEmployee(userId: string, query: PublishedPolicyListQuery) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'EMPLOYEE') throw new AppError(403, 'FORBIDDEN', 'Employee role required');
    const [total, policies] = await policyComplianceRepository.listPublishedPoliciesForEmployee(
      userId,
      query,
    );
    return {
      items: policies.map((policy) => {
        const version =
          policy.policy_versions_policies_current_published_version_idTopolicy_versions;
        if (!version) throw new Error('Published policy has no current published version');
        return {
          policyId: policy.id,
          policyCode: policy.policy_code,
          title: policy.title,
          description: policy.description,
          versionId: version.id,
          versionNumber: version.version_number,
          effectiveDate: version.published_at,
          publishedAt: version.published_at,
          acknowledgedAt: version.policy_acknowledgements[0]?.acknowledged_at ?? null,
          changeSummary: version.change_summary,
          previousAcknowledgement: mapPreviousAcknowledgement(policy.policy_versions_policy_versions_policy_idTopolicies),
        };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Read the current publication and this Employee's acknowledgement context.
  async getPublishedPolicyForEmployee(userId: string, policyId: string, versionId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'EMPLOYEE') throw new AppError(403, 'FORBIDDEN', 'Employee role required');
    const version = await policyComplianceRepository.findPublishedPolicyForEmployee(
      policyId,
      versionId,
      userId,
    );
    if (!version)
      throw new AppError(404, 'PUBLISHED_POLICY_NOT_FOUND', 'Published policy was not found');
    const policy = version.policies_policy_versions_policy_idTopolicies;
    return {
      policyId: version.policy_id,
      policyCode: policy.policy_code,
      title: policy.title,
      description: policy.description,
      version: {
        id: version.id,
        versionNumber: version.version_number,
        content: version.content,
        changeSummary: version.change_summary,
        effectiveDate: version.published_at,
        publishedAt: version.published_at,
      },
      acknowledgedAt: version.policy_acknowledgements[0]?.acknowledged_at ?? null,
      previousAcknowledgement: mapPreviousAcknowledgement(policy.policy_versions_policy_versions_policy_idTopolicies),
    };
  },

  // Validate Employee access before confirming the selected published version.
  async acknowledgePublishedPolicy(userId: string, policyId: string, versionId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'EMPLOYEE') throw new AppError(403, 'FORBIDDEN', 'Employee role required');
    const version = await policyComplianceRepository.findPublishedPolicyForEmployee(
      policyId,
      versionId,
      userId,
    );
    if (!version)
      throw new AppError(404, 'PUBLISHED_POLICY_NOT_FOUND', 'Published policy was not found');
    const acknowledgement = await policyComplianceRepository.createPolicyAcknowledgement(
      policyId,
      versionId,
      userId,
    );
    return {
      policyId,
      versionId,
      acknowledgedAt: acknowledgement.acknowledged_at,
      alreadyAcknowledged: acknowledgement.alreadyAcknowledged,
    };
  },

  // List rejection decisions within the actor's policy ownership scope.
  async listRejectedPolicies(userId: string, query: RejectedPolicyQuery) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER') {
      throw new AppError(403, 'FORBIDDEN', 'Admin or Security Officer role required');
    }
    const [total, decisions] = await policyComplianceRepository.listRejectedPolicies(
      query,
      actor.role === 'SECURITY_OFFICER' ? userId : undefined,
    );
    return {
      items: decisions.map(mapRejectedPolicy),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Require an active Admin before recording a rejection reason.
  async rejectPolicy(userId: string, policyId: string, versionId: string, input: RejectPolicyBody) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version) {
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    }
    const result = await policyComplianceRepository.rejectDraft(policyId, versionId, userId, input);
    if (!result) {
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before it could be rejected',
      );
    }
    return {
      ...mapPolicyReview(result.version),
      decision: {
        id: result.decision.id,
        action: result.decision.action,
        comment: result.decision.comment ?? input.reason,
        actorUserId: result.decision.actor_user_id,
        decidedAt: result.decision.decided_at,
      },
    };
  },

  // Require completed Admin review before allowing publication approval.
  async approveForPublication(userId: string, policyId: string, versionId: string) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version)
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    if (version.status !== 'WAITING_APPROVAL')
      throw new AppError(
        409,
        'POLICY_REVIEW_REQUIRED',
        'The policy draft must be reviewed before it can be approved',
      );
    const result = await policyComplianceRepository.approveDraftForPublication(
      policyId,
      versionId,
      userId,
    );
    if (!result)
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before it could be approved',
      );
    return {
      ...mapPolicyReview(result.version),
      decision: {
        id: result.decision.id,
        action: result.decision.action,
        comment: result.decision.comment,
        actorUserId: result.decision.actor_user_id,
        decidedAt: result.decision.decided_at,
      },
    };
  },

  // Require an active Admin and an approved version before publication.
  async publishPolicyVersion(userId: string, policyId: string, versionId: string) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findPolicyVersionForPublication(
      policyId,
      versionId,
    );
    if (!version)
      throw new AppError(
        404,
        'APPROVED_POLICY_VERSION_NOT_FOUND',
        'Approved policy version not found',
      );

    const published = await policyComplianceRepository.publishApprovedVersion(policyId, versionId);
    if (!published)
      throw new AppError(
        409,
        'POLICY_VERSION_CHANGED',
        'The approved policy version changed before it could be published',
      );
    const response = mapPolicyReview(published);
    return {
      ...response,
      version: { ...response.version, effectiveDate: published.published_at },
    };
  },

  // Require IN_REVIEW before recording completion of the Admin review.
  async reviewPolicy(userId: string, policyId: string, versionId: string) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version)
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    if (version.status === 'WAITING_APPROVAL')
      throw new AppError(409, 'POLICY_ALREADY_REVIEWED', 'Policy draft has already been reviewed');
    if (version.status !== 'IN_REVIEW')
      throw new AppError(409, 'POLICY_NOT_REVIEWABLE', 'Policy draft is not awaiting review');

    const result = await policyComplianceRepository.reviewDraft(policyId, versionId, userId);
    if (!result)
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before the review could be completed',
      );
    return {
      ...mapPolicyReview(result.version),
      decision: {
        id: result.decision.id,
        action: result.decision.action,
        comment: result.decision.comment,
        actorUserId: result.decision.actor_user_id,
        decidedAt: result.decision.decided_at,
      },
    };
  },

  // Read one draft within the current Security Officer ownership scope.
  async getOwnDraft(userId: string, policyId: string, versionId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const draft = await policyComplianceRepository.findOwnDraftDetail(userId, policyId, versionId);
    if (!draft) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft not found');
    return mapOwnedPolicyDraft(draft);
  },

  // Check draft ownership and status before applying editable fields.
  async editOwnDraft(
    userId: string,
    policyId: string,
    versionId: string,
    input: EditPolicyDraftBody,
  ) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');

    const draft = await policyComplianceRepository.findDraftForEdit(policyId, versionId);
    if (!draft) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft not found');
    const policy = draft.policies_policy_versions_policy_idTopolicies;
    if (draft.author_user_id !== userId || policy.owner_user_id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'You can only edit policy drafts you own');
    if (!['DRAFT', 'ACTIVE'].includes(policy.status) || draft.status !== 'DRAFT')
      throw new AppError(
        409,
        'POLICY_DRAFT_NOT_EDITABLE',
        'Only a draft policy version can be edited',
      );

    try {
      const updated = await policyComplianceRepository.editDraft(
        policyId,
        versionId,
        userId,
        input,
      );
      if (!updated)
        throw new AppError(
          409,
          'POLICY_DRAFT_CHANGED',
          'The policy draft changed before it could be updated',
        );
      return mapOwnedPolicyDraft(updated);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          409,
          'POLICY_VERSION_CONFLICT',
          'This policy already has the requested version number',
        );
      }
      throw error;
    }
  },

  // Require an active Admin before returning a submitted version for revision.
  async requestRevision(
    userId: string,
    policyId: string,
    versionId: string,
    input: RequestPolicyRevisionBody,
  ) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version) {
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    }
    const result = await policyComplianceRepository.requestDraftRevision(
      policyId,
      versionId,
      userId,
      input,
    );
    if (!result) {
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before revision could be requested',
      );
    }
    return {
      ...mapPolicyReview(result.version),
      decision: {
        id: result.decision.id,
        action: result.decision.action,
        comment: result.decision.comment ?? input.comment,
        actorUserId: result.decision.actor_user_id,
        decidedAt: result.decision.decided_at,
      },
    };
  },
  // Require an owned draft with applicability before submitting it for Admin review.
  async submitForReview(userId: string, policyId: string, versionId: string) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const draft = await policyComplianceRepository.findDraftForSubmission(policyId, versionId);
    if (!draft) throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Policy draft not found');
    const policy = draft.policies_policy_versions_policy_idTopolicies;
    if (draft.author_user_id !== userId && policy.owner_user_id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'You can only submit policy drafts you own');
    if (!['DRAFT', 'ACTIVE'].includes(policy.status) || draft.status !== 'DRAFT')
      throw new AppError(
        409,
        'POLICY_DRAFT_NOT_SUBMITTABLE',
        'Only an active draft policy version can be submitted for review',
      );
    if (!draft.policy_applicabilities)
      throw new AppError(
        409,
        'POLICY_APPLICABILITY_REQUIRED',
        'Define policy applicability before submitting the draft for review',
      );
    const submitted = await policyComplianceRepository.submitDraft(policyId, versionId, userId);
    if (!submitted)
      throw new AppError(
        409,
        'POLICY_DRAFT_CHANGED',
        'The policy draft changed before it could be submitted',
      );
    return toSubmittedDraft(submitted);
  },
  // List authored drafts within the current policy ownership scope.
  async listOwnDrafts(userId: string, query: ListPolicyDraftsQuery) {
    const actor = await policyComplianceRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    if (actor.role !== 'SECURITY_OFFICER')
      throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
    const [total, drafts] = await policyComplianceRepository.listOwnDrafts(userId, query);
    return {
      items: drafts.map(mapOwnedPolicyDraft),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  // List submitted policies eligible for the Admin review workspace.
  async listReviewableDrafts(userId: string, query: ReviewablePolicyDraftQuery) {
    await requireActiveAdmin(userId);
    const [total, policies] = await policyComplianceRepository.listReviewableDrafts(query);
    return {
      items: policies.map(mapReviewablePolicy),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // Require an active Admin before returning a submitted version.
  async getReviewableDraft(userId: string, policyId: string, versionId: string) {
    await requireActiveAdmin(userId);
    const version = await policyComplianceRepository.findReviewableDraft(policyId, versionId);
    if (!version) {
      throw new AppError(404, 'POLICY_DRAFT_NOT_FOUND', 'Submitted policy draft not found');
    }
    return mapPolicyReview(version);
  },
};

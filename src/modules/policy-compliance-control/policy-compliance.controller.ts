import type { RequestHandler } from 'express';
import {
  createPolicyVersionBodySchema,
  createPolicyVersionParamsSchema,
} from './dto/create-policy-version.dto.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  policyDraftReviewParamsSchema,
  reviewablePolicyDraftQuerySchema,
} from './dto/view-policy-draft.dto.js';
import { policyComplianceService } from './policy-compliance.service.js';
import { listPolicyDraftsQuerySchema } from './dto/list-policy-drafts.dto.js';
import { submitPolicyForReviewParamsSchema } from './dto/submit-policy-for-review.dto.js';
import { approvePolicyForPublicationParamsSchema } from './dto/approve-policy-for-publication.dto.js';
import {
  editPolicyDraftBodySchema,
  editPolicyDraftParamsSchema,
} from './dto/edit-policy-draft.dto.js';
import {
  requestPolicyRevisionBodySchema,
  requestPolicyRevisionParamsSchema,
} from './dto/request-policy-revision.dto.js';
import {
  rejectedPolicyQuerySchema,
  rejectPolicyBodySchema,
  rejectPolicyParamsSchema,
} from './dto/reject-policy.dto.js';
import {
  publishedPolicyListQuerySchema,
  publishedPolicyParamsSchema,
} from './dto/view-published-policy.dto.js';
import { createPolicyDraftBodySchema } from './dto/create-policy-draft.dto.js';
import {
  policyVersionHistoryParamsSchema,
  policyVersionHistoryQuerySchema,
} from './dto/policy-version-history.dto.js';
import {
  definePolicyApplicabilityBodySchema,
  policyApplicabilityParamsSchema,
} from './dto/define-policy-applicability.dto.js';

// Parse request inputs and pass the authenticated user to the createPolicyVersion service flow.
export const createPolicyVersion: RequestHandler = async (req, res) => {
  const { policyId } = createPolicyVersionParamsSchema.parse(req.params);
  const data = await policyComplianceService.createPolicyVersion(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    createPolicyVersionBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the getPolicyApplicability service flow.
export const getPolicyApplicability: RequestHandler = async (req, res) => {
  const { policyId, versionId } = policyApplicabilityParamsSchema.parse(req.params);
  const data = await policyComplianceService.getApplicability(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the definePolicyApplicability service flow.
export const definePolicyApplicability: RequestHandler = async (req, res) => {
  const { policyId, versionId } = policyApplicabilityParamsSchema.parse(req.params);
  const data = await policyComplianceService.defineApplicability(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
    definePolicyApplicabilityBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the authenticatedUserId service flow.
function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}

// Parse request inputs and pass the authenticated user to the listReviewablePolicyDrafts service flow.
export const listReviewablePolicyDrafts: RequestHandler = async (req, res) => {
  const data = await policyComplianceService.listReviewableDrafts(
    authenticatedUserId(res.locals.authenticatedUserId),
    reviewablePolicyDraftQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the createPolicyDraft service flow.
export const createPolicyDraft: RequestHandler = async (req, res) => {
  const data = await policyComplianceService.createPolicyDraft(
    authenticatedUserId(res.locals.authenticatedUserId),
    createPolicyDraftBodySchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the getPolicyDraftReview service flow.
export const getPolicyDraftReview: RequestHandler = async (req, res) => {
  const { policyId, versionId } = policyDraftReviewParamsSchema.parse(req.params);
  const data = await policyComplianceService.getReviewableDraft(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the listPolicyVersionHistory service flow.
export const listPolicyVersionHistory: RequestHandler = async (req, res) => {
  const data = await policyComplianceService.listPolicyVersionHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyVersionHistoryQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the getPolicyVersionHistory service flow.
export const getPolicyVersionHistory: RequestHandler = async (req, res) => {
  const { policyId, versionId } = policyVersionHistoryParamsSchema.parse(req.params);
  const data = await policyComplianceService.getPolicyVersionHistory(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the reviewPolicy service flow.
export const reviewPolicy: RequestHandler = async (req, res) => {
  const { policyId, versionId } = policyDraftReviewParamsSchema.parse(req.params);
  const data = await policyComplianceService.reviewPolicy(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the listOwnPolicyDrafts service flow.
export const listOwnPolicyDrafts: RequestHandler = async (req, res) => {
  const data = await policyComplianceService.listOwnDrafts(
    authenticatedUserId(res.locals.authenticatedUserId),
    listPolicyDraftsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the submitPolicyForReview service flow.
export const submitPolicyForReview: RequestHandler = async (req, res) => {
  const { policyId, versionId } = submitPolicyForReviewParamsSchema.parse(req.params);
  const data = await policyComplianceService.submitForReview(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the approvePolicyForPublication service flow.
export const approvePolicyForPublication: RequestHandler = async (req, res) => {
  const { policyId, versionId } = approvePolicyForPublicationParamsSchema.parse(req.params);
  const data = await policyComplianceService.approveForPublication(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the publishPolicyVersion service flow.
export const publishPolicyVersion: RequestHandler = async (req, res) => {
  const { policyId, versionId } = approvePolicyForPublicationParamsSchema.parse(req.params);
  const data = await policyComplianceService.publishPolicyVersion(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the getOwnPolicyDraft service flow.
export const getOwnPolicyDraft: RequestHandler = async (req, res) => {
  const { policyId, versionId } = editPolicyDraftParamsSchema.parse(req.params);
  const data = await policyComplianceService.getOwnDraft(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the editPolicyDraft service flow.
export const editPolicyDraft: RequestHandler = async (req, res) => {
  const { policyId, versionId } = editPolicyDraftParamsSchema.parse(req.params);
  const data = await policyComplianceService.editOwnDraft(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
    editPolicyDraftBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the requestPolicyRevision service flow.
export const requestPolicyRevision: RequestHandler = async (req, res) => {
  const { policyId, versionId } = requestPolicyRevisionParamsSchema.parse(req.params);
  const data = await policyComplianceService.requestRevision(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
    requestPolicyRevisionBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the rejectPolicy service flow.
export const rejectPolicy: RequestHandler = async (req, res) => {
  const { policyId, versionId } = rejectPolicyParamsSchema.parse(req.params);
  const data = await policyComplianceService.rejectPolicy(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
    rejectPolicyBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the listRejectedPolicies service flow.
export const listRejectedPolicies: RequestHandler = async (req, res) => {
  const data = await policyComplianceService.listRejectedPolicies(
    authenticatedUserId(res.locals.authenticatedUserId),
    rejectedPolicyQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the listOwnedPublishedPolicies service flow.
export const listOwnedPublishedPolicies: RequestHandler = async (_req, res) => {
  const data = await policyComplianceService.listOwnedPublishedPolicies(
    authenticatedUserId(res.locals.authenticatedUserId),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the listEmployeePublishedPolicies service flow.
export const listEmployeePublishedPolicies: RequestHandler = async (req, res) => {
  const data = await policyComplianceService.listPublishedPoliciesForEmployee(
    authenticatedUserId(res.locals.authenticatedUserId),
    publishedPolicyListQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the getEmployeePublishedPolicy service flow.
export const getEmployeePublishedPolicy: RequestHandler = async (req, res) => {
  const { policyId, versionId } = publishedPolicyParamsSchema.parse(req.params);
  const data = await policyComplianceService.getPublishedPolicyForEmployee(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

// Parse request inputs and pass the authenticated user to the acknowledgeEmployeePublishedPolicy service flow.
export const acknowledgeEmployeePublishedPolicy: RequestHandler = async (req, res) => {
  const { policyId, versionId } = publishedPolicyParamsSchema.parse(req.params);
  const data = await policyComplianceService.acknowledgePublishedPolicy(
    authenticatedUserId(res.locals.authenticatedUserId),
    policyId,
    versionId,
  );
  res.status(200).json({ success: true, data });
};

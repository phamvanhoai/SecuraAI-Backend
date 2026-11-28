import { Router } from 'express';
import { createPolicyVersion } from './policy-compliance.controller.js';
import {
  createPolicyVersionBodySchema,
  createPolicyVersionParamsSchema,
} from './dto/create-policy-version.dto.js';
import {
  listControlEvidence,
  addControlEvidence,
  linkControlEvidence,
  unlinkControlEvidence,
  uploadControlEvidence,
  downloadControlEvidence,
} from './control-evidence.controller.js';
import { uploadControlEvidenceFile } from './control-evidence.upload.js';
import {
  addControlEvidenceSchema,
  linkControlEvidenceSchema,
  unlinkControlEvidenceSchema,
  listControlEvidenceSchema,
  evidenceParamsSchema,
} from './dto/control-evidence.dto.js';
import {
  getCatalogControl,
  listControlOwners,
  createCatalogControl,
  editCatalogControl,
} from './control-catalog.controller.js';
import {
  controlParamsSchema,
  controlOwnerQuerySchema,
  createControlSchema,
  editControlSchema,
} from './dto/manage-control.dto.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  getPolicyDraftReview,
  getOwnPolicyDraft,
  listOwnPolicyDrafts,
  submitPolicyForReview,
  listReviewablePolicyDrafts,
  approvePolicyForPublication,
  editPolicyDraft,
  requestPolicyRevision,
  rejectPolicy,
  listRejectedPolicies,
  listOwnedPublishedPolicies,
  listEmployeePublishedPolicies,
  getEmployeePublishedPolicy,
  acknowledgeEmployeePublishedPolicy,
  createPolicyDraft,
  reviewPolicy,
  publishPolicyVersion,
  listPolicyVersionHistory,
  getPolicyVersionHistory,
  getPolicyApplicability,
  definePolicyApplicability,
} from './policy-compliance.controller.js';
import {
  policyDraftReviewParamsSchema,
  reviewablePolicyDraftQuerySchema,
} from './dto/view-policy-draft.dto.js';
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
  assessControlEffectiveness,
  listControlEffectiveness,
} from './control-effectiveness.controller.js';
import {
  assessControlEffectivenessBodySchema,
  controlEffectivenessParamsSchema,
  listControlEffectivenessQuerySchema,
} from './dto/assess-control-effectiveness.dto.js';
import {
  policyVersionHistoryParamsSchema,
  policyVersionHistoryQuerySchema,
} from './dto/policy-version-history.dto.js';
import {
  definePolicyApplicabilityBodySchema,
  policyApplicabilityParamsSchema,
} from './dto/define-policy-applicability.dto.js';

export const policyComplianceRouter = Router();
// createPolicyVersion: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions',
  authenticate,
  validate({ params: createPolicyVersionParamsSchema, body: createPolicyVersionBodySchema }),
  asyncHandler(createPolicyVersion),
);
// getOwnPolicyDraft: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/controls/:controlId/evidence',
  authenticate,
  validate({ params: controlParamsSchema, query: listControlEvidenceSchema }),
  asyncHandler(listControlEvidence),
);
policyComplianceRouter.post(
  '/controls/:controlId/evidence',
  authenticate,
  validate({ params: controlParamsSchema, body: addControlEvidenceSchema }),
  asyncHandler(addControlEvidence),
);
policyComplianceRouter.delete(
  '/controls/:controlId/evidence-links/:evidenceId',
  authenticate,
  validate({
    params: controlParamsSchema.merge(evidenceParamsSchema),
    body: unlinkControlEvidenceSchema,
  }),
  asyncHandler(unlinkControlEvidence),
);
policyComplianceRouter.post(
  '/controls/:controlId/evidence-links',
  authenticate,
  validate({ params: controlParamsSchema, body: linkControlEvidenceSchema }),
  asyncHandler(linkControlEvidence),
);
policyComplianceRouter.post(
  '/controls/:controlId/evidence-files',
  authenticate,
  uploadControlEvidenceFile,
  validate({ params: controlParamsSchema }),
  asyncHandler(uploadControlEvidence),
);
// getPolicyApplicability: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/evidence/:evidenceId/download',
  authenticate,
  validate({ params: evidenceParamsSchema }),
  asyncHandler(downloadControlEvidence),
);
policyComplianceRouter.get(
  '/controls/owner-options',
  authenticate,
  validate({ query: controlOwnerQuerySchema }),
  asyncHandler(listControlOwners),
);
policyComplianceRouter.get(
  '/controls/:controlId',
  authenticate,
  validate({ params: controlParamsSchema }),
  asyncHandler(getCatalogControl),
);
policyComplianceRouter.post(
  '/controls',
  authenticate,
  validate({ body: createControlSchema }),
  asyncHandler(createCatalogControl),
);
policyComplianceRouter.get(
  '/policies/:policyId/drafts/:versionId',
  authenticate,
  validate({ params: editPolicyDraftParamsSchema }),
  asyncHandler(getOwnPolicyDraft),
);
policyComplianceRouter.patch(
  '/controls/:controlId',
  authenticate,
  validate({ params: controlParamsSchema, body: editControlSchema }),
  asyncHandler(editCatalogControl),
);
policyComplianceRouter.get(
  '/policies/:policyId/versions/:versionId/applicability',
  authenticate,
  validate({ params: policyApplicabilityParamsSchema }),
  asyncHandler(getPolicyApplicability),
);
// definePolicyApplicability: authenticate -> validate request -> controller -> service.
policyComplianceRouter.put(
  '/policies/:policyId/versions/:versionId/applicability',
  authenticate,
  validate({ params: policyApplicabilityParamsSchema, body: definePolicyApplicabilityBodySchema }),
  asyncHandler(definePolicyApplicability),
);
// listPolicyVersionHistory: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/version-history',
  authenticate,
  validate({ query: policyVersionHistoryQuerySchema }),
  asyncHandler(listPolicyVersionHistory),
);
// getPolicyVersionHistory: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/:policyId/versions/:versionId/history',
  authenticate,
  validate({ params: policyVersionHistoryParamsSchema }),
  asyncHandler(getPolicyVersionHistory),
);
// createPolicyDraft: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies',
  authenticate,
  validate({ body: createPolicyDraftBodySchema }),
  asyncHandler(createPolicyDraft),
);
// View the Control effectiveness list within the user's access scope.
policyComplianceRouter.get(
  '/control-assessments',
  authenticate,
  validate({ query: listControlEffectivenessQuerySchema }),
  asyncHandler(listControlEffectiveness),
);
// Save a new effectiveness assessment for the selected Control.
// The service checks whether the user may assess this Control.
policyComplianceRouter.post(
  '/controls/:controlId/assessments',
  authenticate,
  validate({
    params: controlEffectivenessParamsSchema,
    body: assessControlEffectivenessBodySchema,
  }),
  asyncHandler(assessControlEffectiveness),
);
// listEmployeePublishedPolicies: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/published/mine',
  authenticate,
  asyncHandler(listOwnedPublishedPolicies),
);
// getEmployeePublishedPolicy: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/acknowledgements/mine',
  authenticate,
  validate({ query: publishedPolicyListQuerySchema }),
  asyncHandler(listEmployeePublishedPolicies),
);
policyComplianceRouter.get(
  '/policies/:policyId/versions/:versionId/acknowledgement',
  authenticate,
  validate({ params: publishedPolicyParamsSchema }),
  asyncHandler(getEmployeePublishedPolicy),
);
// acknowledgeEmployeePublishedPolicy: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/acknowledgements',
  authenticate,
  validate({ params: publishedPolicyParamsSchema }),
  asyncHandler(acknowledgeEmployeePublishedPolicy),
);
// listRejectedPolicies: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/rejected',
  authenticate,
  validate({ query: rejectedPolicyQuerySchema }),
  asyncHandler(listRejectedPolicies),
);
// rejectPolicy: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/reject',
  authenticate,
  validate({ params: rejectPolicyParamsSchema, body: rejectPolicyBodySchema }),
  asyncHandler(rejectPolicy),
);
// approvePolicyForPublication: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/approve',
  authenticate,
  validate({ params: approvePolicyForPublicationParamsSchema }),
  asyncHandler(approvePolicyForPublication),
);
// editPolicyDraft: authenticate -> validate request -> controller -> service.
policyComplianceRouter.patch(
  '/policies/:policyId/drafts/:versionId',
  authenticate,
  validate({ params: editPolicyDraftParamsSchema, body: editPolicyDraftBodySchema }),
  asyncHandler(editPolicyDraft),
);
// requestPolicyRevision: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/revision-requests',
  authenticate,
  validate({ params: requestPolicyRevisionParamsSchema, body: requestPolicyRevisionBodySchema }),
  asyncHandler(requestPolicyRevision),
);
// submitPolicyForReview: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/submit',
  authenticate,
  validate({ params: submitPolicyForReviewParamsSchema }),
  asyncHandler(submitPolicyForReview),
);
// listOwnPolicyDrafts: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/drafts/mine',
  authenticate,
  validate({ query: listPolicyDraftsQuerySchema }),
  asyncHandler(listOwnPolicyDrafts),
);
// listReviewablePolicyDrafts: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/drafts/reviewable',
  authenticate,
  validate({ query: reviewablePolicyDraftQuerySchema }),
  asyncHandler(listReviewablePolicyDrafts),
);
// getPolicyDraftReview: authenticate -> validate request -> controller -> service.
policyComplianceRouter.get(
  '/policies/:policyId/versions/:versionId/review',
  authenticate,
  validate({ params: policyDraftReviewParamsSchema }),
  asyncHandler(getPolicyDraftReview),
);
// publishPolicyVersion: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/publish',
  authenticate,
  validate({ params: approvePolicyForPublicationParamsSchema }),
  asyncHandler(publishPolicyVersion),
);
// reviewPolicy: authenticate -> validate request -> controller -> service.
policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/review',
  authenticate,
  validate({ params: policyDraftReviewParamsSchema }),
  asyncHandler(reviewPolicy),
);

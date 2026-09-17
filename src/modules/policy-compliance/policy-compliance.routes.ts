import { Router } from 'express';
import { policyAcknowledgementRouter } from './policy-acknowledgement.routes.js';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { createPolicyDraftSchema } from './dto/create-policy-draft.dto.js';
import {
  assignPolicyDepartments,
  createPolicyDraft,
  getDraftPolicyVersion,
  listPublishablePolicies,
  getOwnPolicyDraft,
  listOwnPolicyDrafts,
  listPolicyDepartmentAssignments,
  listOwnedPublishedPoliciesForNewVersion,
  publishPolicyVersion,
  updateOwnPolicyDraft,
  updatePolicyAndCreateVersion,
} from './policy-compliance.controller.js';
import {
  assignPolicyDepartmentsBodySchema,
  assignPolicyDepartmentsParamsSchema,
  listPolicyDepartmentAssignmentsQuerySchema,
} from './dto/assign-policy-departments.dto.js';
import { getPolicyVersionParamsSchema } from './dto/get-policy-version.dto.js';
import { listPublishablePoliciesQuerySchema } from './dto/list-publishable-policies.dto.js';
import {
  listOwnPolicyDraftsQuerySchema,
  policyDraftParamsSchema,
  updatePolicyDraftSchema,
} from './dto/manage-policy-draft.dto.js';
import {
  publishPolicyVersionBodySchema,
  publishPolicyVersionParamsSchema,
} from './dto/publish-policy-version.dto.js';
import {
  updatePolicyCreateVersionBodySchema,
  updatePolicyCreateVersionParamsSchema,
} from './dto/update-policy-create-version.dto.js';
import { controlAssessmentParamsSchema, createControlAssessmentBodySchema, listControlAssessmentsQuerySchema } from './dto/control-assessment.dto.js';
import { createControlAssessment, getControlAssessmentHistory, listControlAssessments } from './control-assessment.controller.js';
import { downloadComplianceEvidence, listEvidenceAssessments, uploadComplianceEvidence } from './compliance-evidence.controller.js';
import { uploadComplianceEvidenceFile } from './compliance-evidence.upload.js';
import { listEvidenceAssessmentsQuerySchema } from './dto/compliance-evidence.dto.js';
import { policyControlMappingRouter } from './policy-control-mapping.routes.js';

export const policyComplianceRouter = Router();
policyComplianceRouter.use(policyControlMappingRouter);
policyComplianceRouter.use(policyAcknowledgementRouter);

policyComplianceRouter.get('/evidence/assessments', authenticate, authorize('compliance.evidence.upload'), validate({ query: listEvidenceAssessmentsQuerySchema }), asyncHandler(listEvidenceAssessments));
policyComplianceRouter.post('/control-assessments/:assessmentId/evidence', authenticate, authorize('compliance.evidence.upload'), uploadComplianceEvidenceFile, asyncHandler(uploadComplianceEvidence));
policyComplianceRouter.get('/evidence/:evidenceId/download', authenticate, authorize('compliance.evidence.upload'), asyncHandler(downloadComplianceEvidence));

policyComplianceRouter.get('/control-assessments', authenticate, authorize('compliance.assess-controls'), validate({ query: listControlAssessmentsQuerySchema }), asyncHandler(listControlAssessments));
policyComplianceRouter.get('/controls/:controlId/assessments', authenticate, authorize('compliance.assess-controls'), validate({ params: controlAssessmentParamsSchema }), asyncHandler(getControlAssessmentHistory));
policyComplianceRouter.post('/controls/:controlId/assessments', authenticate, authorize('compliance.assess-controls'), validate({ params: controlAssessmentParamsSchema, body: createControlAssessmentBodySchema }), asyncHandler(createControlAssessment));

policyComplianceRouter.get(
  '/policies/department-assignments',
  authenticate,
  authorize('policies.assign-department'),
  validate({ query: listPolicyDepartmentAssignmentsQuerySchema }),
  asyncHandler(listPolicyDepartmentAssignments),
);

policyComplianceRouter.put(
  '/policies/:policyId/departments',
  authenticate,
  authorize('policies.assign-department'),
  validate({
    params: assignPolicyDepartmentsParamsSchema,
    body: assignPolicyDepartmentsBodySchema,
  }),
  asyncHandler(assignPolicyDepartments),
);

policyComplianceRouter.post(
  '/policies',
  authenticate,
  authorize('policies.create'),
  validate({ body: createPolicyDraftSchema }),
  asyncHandler(createPolicyDraft),
);

policyComplianceRouter.get(
  '/policies/drafts/reviewable',
  authenticate,
  authorize('policies.publish'),
  validate({ query: listPublishablePoliciesQuerySchema }),
  asyncHandler(listPublishablePolicies),
);

policyComplianceRouter.get(
  '/policies/:policyId/versions/:versionId/review',
  authenticate,
  authorize('policies.publish'),
  validate({ params: getPolicyVersionParamsSchema }),
  asyncHandler(getDraftPolicyVersion),
);

policyComplianceRouter.get(
  '/policies/drafts/mine',
  authenticate,
  authorize('policies.create'),
  validate({ query: listOwnPolicyDraftsQuerySchema }),
  asyncHandler(listOwnPolicyDrafts),
);

policyComplianceRouter.get(
  '/policies/published/mine',
  authenticate,
  authorize('policies.update'),
  asyncHandler(listOwnedPublishedPoliciesForNewVersion),
);

policyComplianceRouter.get(
  '/policies/:policyId/drafts/:versionId',
  authenticate,
  authorize('policies.create'),
  validate({ params: policyDraftParamsSchema }),
  asyncHandler(getOwnPolicyDraft),
);

policyComplianceRouter.patch(
  '/policies/:policyId/drafts/:versionId',
  authenticate,
  authorize('policies.create'),
  validate({ params: policyDraftParamsSchema, body: updatePolicyDraftSchema }),
  asyncHandler(updateOwnPolicyDraft),
);

policyComplianceRouter.post(
  '/policies/:policyId/versions',
  authenticate,
  authorize('policies.update'),
  validate({
    params: updatePolicyCreateVersionParamsSchema,
    body: updatePolicyCreateVersionBodySchema,
  }),
  asyncHandler(updatePolicyAndCreateVersion),
);

policyComplianceRouter.post(
  '/policies/:policyId/versions/:versionId/publish',
  authenticate,
  authorize('policies.publish'),
  validate({ params: publishPolicyVersionParamsSchema, body: publishPolicyVersionBodySchema }),
  asyncHandler(publishPolicyVersion),
);

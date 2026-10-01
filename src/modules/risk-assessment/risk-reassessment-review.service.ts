import { AppError } from '../../common/errors/app-error.js';
import type { ListOwnedReassessmentRequestsQuery } from './dto/review-risk-reassessment-request.dto.js';
import type { CompleteRiskReassessmentInput } from './dto/review-risk-reassessment-request.dto.js';
import type { RejectRiskReassessmentRequestInput } from './dto/review-risk-reassessment-request.dto.js';
import { riskReassessmentReviewRepository } from './risk-reassessment-review.repository.js';

const mapRequest = (
  request: Awaited<ReturnType<typeof riskReassessmentReviewRepository.findById>> & {},
  userId: string,
) => ({
  id: request.id,
  reason: request.reason,
  status: request.status.toLowerCase(),
  requestedAt: request.requested_at,
  reviewedAt: request.reviewed_at,
  reviewComment: request.review_comment,
  canReject: request.risks.owner_user_id === userId,
  risk: {
    id: request.risks.id,
    riskCode: request.risks.risk_code,
    title: request.risks.title,
    status: request.risks.status.toLowerCase(),
    latestInherentAssessment: request.risks.risk_assessments[0]
      ? {
          likelihood: request.risks.risk_assessments[0].inherent_likelihood,
          impact: request.risks.risk_assessments[0].inherent_impact,
          rating: request.risks.risk_assessments[0].inherent_rating?.toLowerCase() ?? null,
        }
      : null,
    treatmentPlans: request.risks.risk_treatment_plans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      strategy: plan.strategy.toLowerCase(),
      status: plan.status.toLowerCase(),
      targetDate: plan.target_completion_date,
    })),
  },
  incident: {
    id: request.incidents.id,
    incidentCode: request.incidents.incident_code,
    title: request.incidents.title,
    severity: request.incidents.severity?.toLowerCase() ?? null,
  },
  controlWeakness: request.control_findings
    ? {
        id: request.control_findings.id,
        severity: request.control_findings.severity,
        description: request.control_findings.description,
        status: request.control_findings.status.toLowerCase(),
        control: {
          id: request.control_findings.security_controls.id,
          controlCode: request.control_findings.security_controls.control_code,
          name: request.control_findings.security_controls.name,
        },
      }
    : null,
  requestedBy: {
    id: request.users_risk_reassessment_requests_requested_byTousers.id,
    fullName: request.users_risk_reassessment_requests_requested_byTousers.full_name,
  },
  reviewedBy: request.users_risk_reassessment_requests_reviewed_byTousers
    ? {
        id: request.users_risk_reassessment_requests_reviewed_byTousers.id,
        fullName: request.users_risk_reassessment_requests_reviewed_byTousers.full_name,
      }
    : null,
});

export const riskReassessmentReviewService = {
  async listOwned(userId: string, query: ListOwnedReassessmentRequestsQuery) {
    const actor = await riskReassessmentReviewRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const [total, requests] = await riskReassessmentReviewRepository.listOwned(
      actor.role === 'SECURITY_OFFICER' ? undefined : userId,
      query,
    );
    return {
      items: requests.map((request) => mapRequest(request, userId)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },
  async startReview(userId: string, requestId: string) {
    const actor = await riskReassessmentReviewRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const request = await riskReassessmentReviewRepository.findById(requestId);
    if (!request)
      throw new AppError(404, 'REASSESSMENT_REQUEST_NOT_FOUND', 'Reassessment request not found');
    if (actor.role !== 'EMPLOYEE' || request.risks.owner_user_id !== userId)
      throw new AppError(
        403,
        'RISK_OWNER_REQUIRED',
        'Only the assigned Risk Owner may review this request',
      );
    if (request.status !== 'PENDING')
      throw new AppError(
        409,
        'REASSESSMENT_REQUEST_NOT_PENDING',
        'Only a pending request can enter review',
      );
    const updated = await riskReassessmentReviewRepository.startReview(requestId, userId);
    if (!updated)
      throw new AppError(
        409,
        'REASSESSMENT_REQUEST_CHANGED',
        'The request status changed; refresh and try again',
      );
    return mapRequest(updated, userId);
  },
  async reject(userId: string, requestId: string, input: RejectRiskReassessmentRequestInput) {
    const actor = await riskReassessmentReviewRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const request = await riskReassessmentReviewRepository.findById(requestId);
    if (!request)
      throw new AppError(404, 'REASSESSMENT_REQUEST_NOT_FOUND', 'Reassessment request not found');
    if (actor.role !== 'EMPLOYEE' || request.risks.owner_user_id !== userId)
      throw new AppError(
        403,
        'RISK_OWNER_REQUIRED',
        'Only the assigned Risk Owner may reject this request',
      );
    if (!['PENDING', 'UNDER_REVIEW'].includes(request.status))
      throw new AppError(
        409,
        'REASSESSMENT_REQUEST_NOT_REJECTABLE',
        'Only a pending or under-review request can be rejected',
      );
    const result = await riskReassessmentReviewRepository.reject(requestId, userId, input);
    if (!result)
      throw new AppError(
        409,
        'REASSESSMENT_REQUEST_CHANGED',
        'The request status changed; refresh and try again',
      );
    return { requestId, status: 'rejected', reason: input.reason, reviewedAt: result.reviewedAt };
  },
  async complete(userId: string, requestId: string, input: CompleteRiskReassessmentInput) {
    const actor = await riskReassessmentReviewRepository.findActor(userId);
    if (!actor || actor.status !== 'ACTIVE')
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const request = await riskReassessmentReviewRepository.findById(requestId);
    if (!request)
      throw new AppError(404, 'REASSESSMENT_REQUEST_NOT_FOUND', 'Reassessment request not found');
    if (
      actor.role !== 'SECURITY_OFFICER' &&
      (actor.role !== 'EMPLOYEE' || request.risks.owner_user_id !== userId)
    )
      throw new AppError(
        403,
        'REASSESSMENT_REVIEWER_REQUIRED',
        'Risk Owner or Security Officer required',
      );
    const result = await riskReassessmentReviewRepository.complete(requestId, userId, input);
    if (result.kind === 'invalid_status')
      throw new AppError(
        409,
        'REASSESSMENT_NOT_UNDER_REVIEW',
        'Start review before completing reassessment',
      );
    if (result.kind === 'invalid_plan')
      throw new AppError(
        422,
        'INVALID_TREATMENT_PLAN',
        'Select an active treatment plan for this risk',
      );
    if (result.kind === 'missing_inherent')
      throw new AppError(
        422,
        'INHERENT_ASSESSMENT_REQUIRED',
        'The risk needs an inherent assessment first',
      );
    if (result.kind === 'not_found')
      throw new AppError(404, 'REASSESSMENT_REQUEST_NOT_FOUND', 'Reassessment request not found');
    return {
      requestId,
      status: 'completed',
      assessmentId: result.assessment.id,
      residualScore: result.score,
      residualRating: result.assessment.residual_rating?.toLowerCase(),
      treatmentPlan: {
        id: result.treatmentPlan.id,
        title: result.treatmentPlan.title,
        status: result.treatmentPlan.status.toLowerCase(),
        targetDate: result.treatmentPlan.target_completion_date,
      },
      completedAt: result.completedAt,
    };
  },
};

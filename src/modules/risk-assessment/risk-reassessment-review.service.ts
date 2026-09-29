import { AppError } from '../../common/errors/app-error.js';
import type { ListOwnedReassessmentRequestsQuery } from './dto/review-risk-reassessment-request.dto.js';
import { riskReassessmentReviewRepository } from './risk-reassessment-review.repository.js';

async function requireActiveUser(userId: string) {
  const actor = await riskReassessmentReviewRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
}

const mapRequest = (request: Awaited<ReturnType<typeof riskReassessmentReviewRepository.findById>> & {}) => ({
  id: request.id,
  reason: request.reason,
  status: request.status.toLowerCase(),
  requestedAt: request.requested_at,
  reviewedAt: request.reviewed_at,
  risk: {
    id: request.risks.id,
    riskCode: request.risks.risk_code,
    title: request.risks.title,
    status: request.risks.status.toLowerCase(),
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
});

export const riskReassessmentReviewService = {
  async listOwned(userId: string, query: ListOwnedReassessmentRequestsQuery) {
    await requireActiveUser(userId);
    const [total, requests] = await riskReassessmentReviewRepository.listOwned(userId, query);
    return {
      items: requests.map(mapRequest),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  },
  async startReview(userId: string, requestId: string) {
    await requireActiveUser(userId);
    const request = await riskReassessmentReviewRepository.findById(requestId);
    if (!request)
      throw new AppError(404, 'REASSESSMENT_REQUEST_NOT_FOUND', 'Reassessment request not found');
    if (request.risks.owner_user_id !== userId)
      throw new AppError(403, 'RISK_OWNER_REQUIRED', 'Only the assigned Risk Owner may review this request');
    if (request.status !== 'PENDING')
      throw new AppError(409, 'REASSESSMENT_REQUEST_NOT_PENDING', 'Only a pending request can enter review');
    const updated = await riskReassessmentReviewRepository.startReview(requestId, userId);
    if (!updated)
      throw new AppError(409, 'REASSESSMENT_REQUEST_CHANGED', 'The request status changed; refresh and try again');
    return mapRequest(updated);
  },
};

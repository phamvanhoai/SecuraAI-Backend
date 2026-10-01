import { AppError } from '../../common/errors/app-error.js';
import type { CreateRiskReassessmentRequestInput } from './dto/create-risk-reassessment-request.dto.js';
import type { RiskReassessmentRequestHistoryQuery } from './dto/create-risk-reassessment-request.dto.js';
import { riskReassessmentRequestsRepository } from './risk-reassessment-requests.repository.js';

async function requireSecurityOfficer(userId: string) {
  const actor = await riskReassessmentRequestsRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}

const riskResponse = (risk: { id: string; risk_code: string; title: string; status: string }) => ({
  id: risk.id,
  riskCode: risk.risk_code,
  title: risk.title,
  status: risk.status.toLowerCase(),
});

const findingResponse = (finding: {
  id: string;
  severity: string | null;
  description: string;
  status: string;
  security_controls: { id: string; control_code: string; name: string };
}) => ({
  id: finding.id,
  severity: finding.severity,
  description: finding.description,
  status: finding.status.toLowerCase(),
  control: {
    id: finding.security_controls.id,
    controlCode: finding.security_controls.control_code,
    name: finding.security_controls.name,
  },
});

export const riskReassessmentRequestsService = {
  async history(userId: string, incidentId: string, query: RiskReassessmentRequestHistoryQuery) {
    await requireSecurityOfficer(userId);
    const incident = await riskReassessmentRequestsRepository.findIncident(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    const { items, total } = await riskReassessmentRequestsRepository.listHistory(
      incidentId,
      query.page,
      query.limit,
    );
    return {
      incident: {
        id: incident.id,
        incidentCode: incident.incident_code,
        title: incident.title,
      },
      items: items.map((request) => ({
        id: request.id,
        reason: request.reason,
        status: request.status.toLowerCase(),
        requestedAt: request.requested_at,
        reviewedAt: request.reviewed_at,
        risk: {
          ...riskResponse(request.risks),
          owner: request.risks.users_risks_owner_user_idTousers
            ? {
                id: request.risks.users_risks_owner_user_idTousers.id,
                fullName: request.risks.users_risks_owner_user_idTousers.full_name,
              }
            : null,
        },
        controlWeakness: request.control_findings
          ? findingResponse(request.control_findings)
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
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async options(userId: string, incidentId: string) {
    await requireSecurityOfficer(userId);
    const { incident, riskLinks, findings } =
      await riskReassessmentRequestsRepository.findOptions(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    return {
      incident: {
        id: incident.id,
        incidentCode: incident.incident_code,
        title: incident.title,
        status: incident.status.toLowerCase(),
      },
      risks: riskLinks.map((link) => ({
        ...riskResponse(link.risks),
        hasActiveRequest: link.incidents.risk_reassessment_requests.some(
          (request) => request.risk_id === link.risks.id,
        ),
      })),
      controlWeaknesses: findings.map(findingResponse),
    };
  },
  async create(userId: string, incidentId: string, input: CreateRiskReassessmentRequestInput) {
    await requireSecurityOfficer(userId);
    const [incident, riskLink, activeRequest, controlFinding] = await Promise.all([
      riskReassessmentRequestsRepository.findIncident(incidentId),
      riskReassessmentRequestsRepository.findLinkedRisk(incidentId, input.riskId),
      riskReassessmentRequestsRepository.findActiveRequest(incidentId, input.riskId),
      input.controlFindingId
        ? riskReassessmentRequestsRepository.findControlFinding(incidentId, input.controlFindingId)
        : Promise.resolve(null),
    ]);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    if (!riskLink)
      throw new AppError(
        422,
        'RISK_NOT_LINKED',
        'Link the risk to the incident before requesting reassessment',
      );
    if (input.controlFindingId && !controlFinding)
      throw new AppError(
        422,
        'CONTROL_WEAKNESS_NOT_FOUND',
        'The selected control weakness does not belong to this incident',
      );
    if (activeRequest)
      throw new AppError(
        409,
        'ACTIVE_REASSESSMENT_REQUEST_EXISTS',
        'An active reassessment request already exists for this incident and risk',
      );
    const request = await riskReassessmentRequestsRepository.create(incidentId, userId, input);
    return {
      id: request.id,
      reason: request.reason,
      status: request.status.toLowerCase(),
      requestedAt: request.requested_at,
      incident: {
        id: request.incidents.id,
        incidentCode: request.incidents.incident_code,
        title: request.incidents.title,
      },
      risk: riskResponse(request.risks),
      controlWeakness: request.control_findings ? findingResponse(request.control_findings) : null,
    };
  },
};

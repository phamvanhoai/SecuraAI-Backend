import { AppError } from '../../common/errors/app-error.js';
import type { LinkIncidentRiskInput } from './dto/link-incident-risk.dto.js';
import { incidentRisksRepository } from './incident-risks.repository.js';
async function requireSecurityOfficer(userId: string) {
  const actor = await incidentRisksRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}
const riskResponse = (risk: {
  id: string;
  risk_code: string;
  title: string;
  status: string;
  review_date: Date | null;
}) => ({
  id: risk.id,
  riskCode: risk.risk_code,
  title: risk.title,
  status: risk.status.toLowerCase(),
  reviewDate: risk.review_date,
});
export const incidentRisksService = {
  async options(userId: string, incidentId: string) {
    await requireSecurityOfficer(userId);
    const { incident, risks } = await incidentRisksRepository.findOptions(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    return {
      incident: {
        id: incident.id,
        incidentCode: incident.incident_code,
        title: incident.title,
        status: incident.status.toLowerCase(),
      },
      risks: risks.map((risk) => ({
        ...riskResponse(risk),
        linked: risk.incident_risks.length > 0,
      })),
    };
  },
  async link(userId: string, incidentId: string, input: LinkIncidentRiskInput) {
    await requireSecurityOfficer(userId);
    const [incident, risk] = await Promise.all([
      incidentRisksRepository.findIncident(incidentId),
      incidentRisksRepository.findRisk(input.riskId),
    ]);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    if (!risk) throw new AppError(404, 'RISK_NOT_FOUND', 'Existing risk not found');
    try {
      const link = await incidentRisksRepository.link(incidentId, input.riskId, userId);
      return {
        incident: {
          id: link.incidents.id,
          incidentCode: link.incidents.incident_code,
          title: link.incidents.title,
        },
        risk: riskResponse(link.risks),
        linkedAt: link.linked_at,
      };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppError(
          409,
          'INCIDENT_RISK_ALREADY_LINKED',
          'Risk is already linked to this incident',
        );
      throw error;
    }
  },
};

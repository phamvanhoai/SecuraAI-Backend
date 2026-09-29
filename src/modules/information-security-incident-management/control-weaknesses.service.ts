import { AppError } from '../../common/errors/app-error.js';
import type { RecordControlWeaknessInput } from './dto/record-control-weakness.dto.js';
import { controlWeaknessesRepository } from './control-weaknesses.repository.js';
async function requireSecurityOfficer(userId: string) {
  const actor = await controlWeaknessesRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer role required');
}
const controlResponse = (control: {
  id: string;
  control_code: string;
  name: string;
  implementation_status: string;
}) => ({
  id: control.id,
  controlCode: control.control_code,
  name: control.name,
  implementationStatus: control.implementation_status.toLowerCase(),
});
export const controlWeaknessesService = {
  async options(userId: string, incidentId: string) {
    await requireSecurityOfficer(userId);
    const { incident, links } = await controlWeaknessesRepository.findOptions(incidentId);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    return {
      incident: {
        id: incident.id,
        incidentCode: incident.incident_code,
        title: incident.title,
        status: incident.status.toLowerCase(),
      },
      controls: links.map((link) => ({
        ...controlResponse(link.security_controls),
        hasOpenWeakness: link.incidents.control_findings.some(
          (finding) => finding.control_id === link.security_controls.id,
        ),
      })),
    };
  },
  async record(userId: string, incidentId: string, input: RecordControlWeaknessInput) {
    await requireSecurityOfficer(userId);
    const [incident, link, existing] = await Promise.all([
      controlWeaknessesRepository.findIncident(incidentId),
      controlWeaknessesRepository.findLinkedControl(incidentId, input.controlId),
      controlWeaknessesRepository.findOpenWeakness(incidentId, input.controlId),
    ]);
    if (!incident) throw new AppError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
    if (!link)
      throw new AppError(
        422,
        'CONTROL_NOT_LINKED',
        'Link the control to the incident before recording a weakness',
      );
    if (existing)
      throw new AppError(
        409,
        'OPEN_CONTROL_WEAKNESS_EXISTS',
        'An open control weakness already exists for this incident and control',
      );
    const finding = await controlWeaknessesRepository.create(incidentId, userId, input);
    return {
      id: finding.id,
      findingType: finding.finding_type.toLowerCase(),
      severity: finding.severity,
      description: finding.description,
      source: finding.source.toLowerCase(),
      status: finding.status.toLowerCase(),
      identifiedAt: finding.identified_at,
      incident: {
        id: finding.incidents?.id ?? incident.id,
        incidentCode: finding.incidents?.incident_code ?? incident.incident_code,
        title: finding.incidents?.title ?? incident.title,
      },
      control: controlResponse(finding.security_controls),
    };
  },
};

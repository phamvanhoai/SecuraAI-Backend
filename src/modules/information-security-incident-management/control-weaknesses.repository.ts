import { prisma } from '../../database/prisma.js';
export const controlWeaknessesRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  },
  findIncident(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: { id: true, incident_code: true, title: true, status: true },
    });
  },
  findLinkedControl(incidentId: string, controlId: string) {
    return prisma.incident_controls.findUnique({
      where: { incident_id_control_id: { incident_id: incidentId, control_id: controlId } },
      select: {
        security_controls: {
          select: { id: true, control_code: true, name: true, implementation_status: true },
        },
      },
    });
  },
  async findOptions(incidentId: string) {
    const [incident, links] = await Promise.all([
      this.findIncident(incidentId),
      prisma.incident_controls.findMany({
        where: { incident_id: incidentId },
        select: {
          security_controls: {
            select: { id: true, control_code: true, name: true, implementation_status: true },
          },
          incidents: {
            select: {
              control_findings: {
                where: {
                  finding_type: 'CONTROL_WEAKNESS',
                  status: { in: ['OPEN', 'UNDER_REVIEW'] },
                },
                select: { control_id: true },
              },
            },
          },
        },
        orderBy: { security_controls: { control_code: 'asc' } },
        take: 200,
      }),
    ]);
    return { incident, links };
  },
  findOpenWeakness(incidentId: string, controlId: string) {
    return prisma.control_findings.findFirst({
      where: {
        incident_id: incidentId,
        control_id: controlId,
        finding_type: 'CONTROL_WEAKNESS',
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
      },
      select: { id: true },
    });
  },
  create(
    incidentId: string,
    actorId: string,
    input: { controlId: string; severity: string; description: string },
  ) {
    return prisma.control_findings.create({
      data: {
        control_id: input.controlId,
        finding_type: 'CONTROL_WEAKNESS',
        severity: input.severity,
        description: input.description,
        source: 'INCIDENT',
        incident_id: incidentId,
        identified_by: actorId,
      },
      select: {
        id: true,
        finding_type: true,
        severity: true,
        description: true,
        source: true,
        status: true,
        identified_at: true,
        incidents: { select: { id: true, incident_code: true, title: true } },
        security_controls: {
          select: { id: true, control_code: true, name: true, implementation_status: true },
        },
      },
    });
  },
};

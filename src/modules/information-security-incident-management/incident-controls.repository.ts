import { prisma } from '../../database/prisma.js';

export const incidentControlsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
  },
  findIncident(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: { id: true, incident_code: true, title: true, status: true },
    });
  },
  findControl(controlId: string) {
    return prisma.security_controls.findUnique({
      where: { id: controlId },
      select: {
        id: true,
        control_code: true,
        name: true,
        applicability: true,
        implementation_status: true,
      },
    });
  },
  async findOptions(incidentId: string) {
    const [incident, controls] = await Promise.all([
      this.findIncident(incidentId),
      prisma.security_controls.findMany({
        select: {
          id: true,
          control_code: true,
          name: true,
          applicability: true,
          implementation_status: true,
          incident_controls: {
            where: { incident_id: incidentId },
            select: { linked_at: true },
          },
        },
        orderBy: [{ control_code: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
    ]);
    return { incident, controls };
  },
  link(incidentId: string, controlId: string, linkedBy: string) {
    return prisma.incident_controls.create({
      data: { incident_id: incidentId, control_id: controlId, linked_by: linkedBy },
      select: {
        linked_at: true,
        incidents: { select: { id: true, incident_code: true, title: true } },
        security_controls: {
          select: {
            id: true,
            control_code: true,
            name: true,
            applicability: true,
            implementation_status: true,
          },
        },
      },
    });
  },
};

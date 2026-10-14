import { prisma } from '../../database/prisma.js';
import type { IncidentControlOptionsQuery } from './dto/link-incident-control.dto.js';

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
  async findOptions(incidentId: string, query: IncidentControlOptionsQuery) {
    const relationshipFilter =
      query.scope === 'linked'
        ? { some: { incident_id: incidentId } }
        : { none: { incident_id: incidentId } };
    const where = {
      incident_controls: relationshipFilter,
      ...(query.q
        ? {
            OR: [
              { control_code: { contains: query.q, mode: 'insensitive' as const } },
              { name: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [incident, controls, total] = await Promise.all([
      this.findIncident(incidentId),
      prisma.security_controls.findMany({
        where,
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
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.security_controls.count({ where }),
    ]);
    return { incident, controls, total };
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
  unlink(incidentId: string, controlId: string) {
    return prisma.incident_controls.deleteMany({
      where: { incident_id: incidentId, control_id: controlId },
    });
  },
};

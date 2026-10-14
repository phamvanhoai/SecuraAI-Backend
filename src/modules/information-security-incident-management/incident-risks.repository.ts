import { prisma } from '../../database/prisma.js';
import type { IncidentRiskOptionsQuery } from './dto/link-incident-risk.dto.js';
export const incidentRisksRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  },
  findIncident(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: { id: true, incident_code: true, title: true, status: true },
    });
  },
  findRisk(riskId: string) {
    return prisma.risks.findFirst({
      where: { id: riskId, status: { not: 'ARCHIVED' } },
      select: { id: true, risk_code: true, title: true, status: true, review_date: true },
    });
  },
  async findOptions(incidentId: string, query: IncidentRiskOptionsQuery) {
    const relationshipFilter =
      query.scope === 'linked'
        ? { some: { incident_id: incidentId } }
        : { none: { incident_id: incidentId } };
    const where = {
      status: { not: 'ARCHIVED' as const },
      incident_risks: relationshipFilter,
      ...(query.q
        ? {
            OR: [
              { risk_code: { contains: query.q, mode: 'insensitive' as const } },
              { title: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [incident, risks, total] = await Promise.all([
      this.findIncident(incidentId),
      prisma.risks.findMany({
        where,
        select: {
          id: true,
          risk_code: true,
          title: true,
          status: true,
          review_date: true,
          incident_risks: { where: { incident_id: incidentId }, select: { linked_at: true } },
        },
        orderBy: [{ risk_code: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.risks.count({ where }),
    ]);
    return { incident, risks, total };
  },
  link(incidentId: string, riskId: string, linkedBy: string) {
    return prisma.incident_risks.create({
      data: { incident_id: incidentId, risk_id: riskId, linked_by: linkedBy },
      select: {
        linked_at: true,
        incidents: { select: { id: true, incident_code: true, title: true } },
        risks: {
          select: { id: true, risk_code: true, title: true, status: true, review_date: true },
        },
      },
    });
  },
  unlink(incidentId: string, riskId: string) {
    return prisma.incident_risks.deleteMany({
      where: { incident_id: incidentId, risk_id: riskId },
    });
  },
};

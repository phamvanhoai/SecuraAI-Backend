import { prisma } from '../../database/prisma.js';
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
  async findOptions(incidentId: string) {
    const [incident, risks] = await Promise.all([
      this.findIncident(incidentId),
      prisma.risks.findMany({
        where: { status: { not: 'ARCHIVED' } },
        select: {
          id: true,
          risk_code: true,
          title: true,
          status: true,
          review_date: true,
          incident_risks: { where: { incident_id: incidentId }, select: { linked_at: true } },
        },
        orderBy: [{ risk_code: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
    ]);
    return { incident, risks };
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
};

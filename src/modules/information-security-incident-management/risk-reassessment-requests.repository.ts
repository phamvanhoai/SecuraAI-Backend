import { prisma } from '../../database/prisma.js';

export const riskReassessmentRequestsRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  },
  findIncident(incidentId: string) {
    return prisma.incidents.findUnique({
      where: { id: incidentId },
      select: { id: true, incident_code: true, title: true, status: true },
    });
  },
  findLinkedRisk(incidentId: string, riskId: string) {
    return prisma.incident_risks.findUnique({
      where: { incident_id_risk_id: { incident_id: incidentId, risk_id: riskId } },
      select: {
        risks: { select: { id: true, risk_code: true, title: true, status: true } },
      },
    });
  },
  findControlFinding(incidentId: string, findingId: string) {
    return prisma.control_findings.findFirst({
      where: {
        id: findingId,
        incident_id: incidentId,
        finding_type: 'CONTROL_WEAKNESS',
      },
      select: {
        id: true,
        severity: true,
        description: true,
        status: true,
        security_controls: { select: { id: true, control_code: true, name: true } },
      },
    });
  },
  findActiveRequest(incidentId: string, riskId: string) {
    return prisma.risk_reassessment_requests.findFirst({
      where: {
        incident_id: incidentId,
        risk_id: riskId,
        status: { in: ['PENDING', 'UNDER_REVIEW'] },
      },
      select: { id: true, status: true },
    });
  },
  async listHistory(incidentId: string, page: number, limit: number) {
    const where = { incident_id: incidentId };
    const [items, total] = await Promise.all([
      prisma.risk_reassessment_requests.findMany({
        where,
        select: {
          id: true,
          reason: true,
          status: true,
          requested_at: true,
          reviewed_at: true,
          review_comment: true,
          risks: {
            select: {
              id: true,
              risk_code: true,
              title: true,
              status: true,
              users_risks_owner_user_idTousers: {
                select: { id: true, full_name: true },
              },
            },
          },
          control_findings: {
            select: {
              id: true,
              severity: true,
              description: true,
              status: true,
              security_controls: { select: { id: true, control_code: true, name: true } },
            },
          },
          users_risk_reassessment_requests_requested_byTousers: {
            select: { id: true, full_name: true },
          },
          users_risk_reassessment_requests_reviewed_byTousers: {
            select: { id: true, full_name: true },
          },
        },
        orderBy: [{ requested_at: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.risk_reassessment_requests.count({ where }),
    ]);
    return { items, total };
  },
  async findOptions(incidentId: string) {
    const [incident, riskLinks, findings] = await Promise.all([
      this.findIncident(incidentId),
      prisma.incident_risks.findMany({
        where: { incident_id: incidentId },
        select: {
          risks: { select: { id: true, risk_code: true, title: true, status: true } },
          incidents: {
            select: {
              risk_reassessment_requests: {
                where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } },
                select: { risk_id: true, status: true },
              },
            },
          },
        },
        orderBy: { risks: { risk_code: 'asc' } },
        take: 200,
      }),
      prisma.control_findings.findMany({
        where: { incident_id: incidentId, finding_type: 'CONTROL_WEAKNESS' },
        select: {
          id: true,
          severity: true,
          description: true,
          status: true,
          security_controls: { select: { id: true, control_code: true, name: true } },
        },
        orderBy: { identified_at: 'desc' },
        take: 200,
      }),
    ]);
    return { incident, riskLinks, findings };
  },
  create(
    incidentId: string,
    requestedBy: string,
    input: { riskId: string; controlFindingId?: string | undefined; reason: string },
  ) {
    return prisma.risk_reassessment_requests.create({
      data: {
        incident_id: incidentId,
        risk_id: input.riskId,
        requested_by: requestedBy,
        reason: input.reason,
        ...(input.controlFindingId ? { control_finding_id: input.controlFindingId } : {}),
      },
      select: {
        id: true,
        reason: true,
        status: true,
        requested_at: true,
        incidents: { select: { id: true, incident_code: true, title: true } },
        risks: { select: { id: true, risk_code: true, title: true, status: true } },
        control_findings: {
          select: {
            id: true,
            severity: true,
            description: true,
            status: true,
            security_controls: { select: { id: true, control_code: true, name: true } },
          },
        },
      },
    });
  },
};

import type { reassessment_status } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListOwnedReassessmentRequestsQuery } from './dto/review-risk-reassessment-request.dto.js';

const requestSelect = {
  id: true,
  reason: true,
  status: true,
  requested_at: true,
  reviewed_at: true,
  risks: {
    select: { id: true, risk_code: true, title: true, status: true, owner_user_id: true },
  },
  incidents: { select: { id: true, incident_code: true, title: true, severity: true } },
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
} as const;

export const riskReassessmentReviewRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({ where: { id: userId }, select: { id: true, status: true } });
  },
  async listOwned(userId: string, query: ListOwnedReassessmentRequestsQuery) {
    const where = {
      risks: { owner_user_id: userId },
      status: query.status
        ? (query.status.toUpperCase() as reassessment_status)
        : { in: ['PENDING', 'UNDER_REVIEW'] as reassessment_status[] },
    };
    return Promise.all([
      prisma.risk_reassessment_requests.count({ where }),
      prisma.risk_reassessment_requests.findMany({
        where,
        select: requestSelect,
        orderBy: [{ requested_at: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
  findById(requestId: string) {
    return prisma.risk_reassessment_requests.findUnique({
      where: { id: requestId },
      select: requestSelect,
    });
  },
  async startReview(requestId: string, userId: string) {
    const result = await prisma.risk_reassessment_requests.updateMany({
      where: { id: requestId, status: 'PENDING', risks: { owner_user_id: userId } },
      data: { status: 'UNDER_REVIEW', reviewed_by: userId },
    });
    if (result.count === 0) return null;
    return this.findById(requestId);
  },
};

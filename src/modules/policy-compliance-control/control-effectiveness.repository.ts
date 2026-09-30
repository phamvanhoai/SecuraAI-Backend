import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type {
  AssessControlEffectivenessBody,
  ListControlEffectivenessQuery,
} from './dto/assess-control-effectiveness.dto.js';

const controlSelect = {
  id: true,
  control_code: true,
  name: true,
  description: true,
  owner_user_id: true,
  applicability: true,
  implementation_status: true,
  users_security_controls_owner_user_idTousers: { select: { id: true, full_name: true } },
  control_evidence_links: {
    where: { evidence_items: { status: 'ACTIVE' as const } },
    select: {
      evidence_items: {
        select: { id: true, name: true, source: true, collected_at: true, reviewed_at: true },
      },
    },
  },
  control_assessments: {
    orderBy: { assessed_at: 'desc' as const },
    take: 5,
    select: {
      id: true,
      assessment_type: true,
      test_method: true,
      result: true,
      effectiveness: true,
      notes: true,
      assessed_at: true,
      users: { select: { id: true, full_name: true } },
    },
  },
} as const;

export const controlEffectivenessRepository = {
  findActor(id: string) {
    return prisma.users.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });
  },
  list(actorId: string, all: boolean, query: ListControlEffectivenessQuery) {
    const where: Prisma.security_controlsWhereInput = {
      ...(!all ? { owner_user_id: actorId } : {}),
      ...(query.q
        ? {
            OR: [
              { control_code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return prisma.$transaction([
      prisma.security_controls.count({ where }),
      prisma.security_controls.findMany({
        where,
        select: controlSelect,
        orderBy: { control_code: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
  find(controlId: string) {
    return prisma.security_controls.findUnique({ where: { id: controlId }, select: controlSelect });
  },
  create(controlId: string, actorId: string, input: AssessControlEffectivenessBody) {
    return prisma.control_assessments.create({
      data: {
        control_id: controlId,
        assessment_type: 'EFFECTIVENESS',
        test_method: input.testMethod,
        result: input.result.toUpperCase(),
        effectiveness: input.effectiveness,
        notes: input.notes,
        assessed_by: actorId,
      },
      select: { id: true, assessed_at: true },
    });
  },
};
export type ControlEffectivenessRecord = Prisma.security_controlsGetPayload<{
  select: typeof controlSelect;
}>;

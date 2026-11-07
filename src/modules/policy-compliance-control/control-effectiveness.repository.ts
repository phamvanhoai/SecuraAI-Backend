import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import { isControlEvidenceUsable } from './control-evidence.rules.js';
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
        select: {
          id: true,
          name: true,
          source: true,
          collected_at: true,
          reviewed_at: true,
          valid_from: true,
          valid_until: true,
        },
      },
    },
  },
  control_assessments: {
    orderBy: { assessed_at: 'desc' as const },
    take: 50,
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
  create(
    controlId: string,
    actorId: string,
    input: AssessControlEffectivenessBody,
    expected: Pick<ControlEffectivenessRecord, 'applicability' | 'implementation_status'>,
  ) {
    // Share the catalog Edit lock so an assessment cannot cross a configuration change or reassignment.
    return prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${actorId}::uuid FOR SHARE`;
        const actor = await tx.users.findUnique({
          where: { id: actorId },
          select: { role: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE')
          throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
        await tx.$queryRaw`SELECT id FROM public.security_controls WHERE id = ${controlId}::uuid FOR UPDATE`;
        const control = await tx.security_controls.findUnique({
          where: { id: controlId },
          select: controlSelect,
        });
        if (!control) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Security control not found');
        if (
          actor.role !== 'SECURITY_OFFICER' &&
          !(actor.role === 'EMPLOYEE' && control.owner_user_id === actorId)
        )
          throw new AppError(
            403,
            'FORBIDDEN',
            'Security Officer or assigned Control Owner required',
          );
        if (
          control.applicability !== expected.applicability ||
          control.implementation_status !== expected.implementation_status
        )
          throw new AppError(
            409,
            'CONTROL_STALE',
            'Control configuration changed. Reload before assessing',
          );
        if (
          !control.control_evidence_links.some((link) =>
            isControlEvidenceUsable(link.evidence_items, new Date()),
          )
        )
          throw new AppError(
            422,
            'CONTROL_EVIDENCE_REQUIRED',
            'At least one active evidence item is required',
          );
        if (
          input.expectedImplementationStatus &&
          input.expectedImplementationStatus !== control.implementation_status.toLowerCase()
        )
          throw new AppError(
            409,
            'CONTROL_STALE',
            'Implementation status changed. Close and reopen Assess Control before saving',
          );
        const nextStatus = input.implementationStatus
          ? (
              {
                not_implemented: 'NOT_IMPLEMENTED',
                planned: 'PLANNED',
                partially_implemented: 'PARTIALLY_IMPLEMENTED',
                implemented: 'IMPLEMENTED',
              } as const
            )[input.implementationStatus]
          : control.implementation_status;
        const changed = nextStatus !== control.implementation_status;
        if (
          changed &&
          (!input.implementationChangeReason || input.implementationChangeReason.trim().length < 10)
        )
          throw new AppError(
            422,
            'IMPLEMENTATION_REASON_REQUIRED',
            'Explain the implementation change in at least 10 characters',
          );
        if (changed)
          await tx.security_controls.update({
            where: { id: controlId },
            data: { implementation_status: nextStatus },
          });
        const assessment = await tx.control_assessments.create({
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
        const auditId = randomUUID();
        const after = {
          implementationStatus: nextStatus,
          assessmentId: assessment.id,
          reason: input.implementationChangeReason ?? null,
          result: input.result,
          effectiveness: input.effectiveness,
        };
        await tx.audit_logs.create({
          data: {
            id: auditId,
            actor_type: 'USER',
            actor_user_id: actorId,
            source: 'API',
            action: changed ? 'CONTROL_IMPLEMENTATION_ASSESSED' : 'CONTROL_EFFECTIVENESS_ASSESSED',
            resource_type: 'SECURITY_CONTROL',
            resource_id: controlId,
            before_data: { implementationStatus: control.implementation_status },
            after_data: after,
            record_hash: createHash('sha256')
              .update(JSON.stringify({ auditId, actorId, controlId, after }))
              .digest('hex'),
          },
        });
        return assessment;
      },
      { maxWait: 5000, timeout: 15000 },
    );
  },
};
export type ControlEffectivenessRecord = Prisma.security_controlsGetPayload<{
  select: typeof controlSelect;
}>;

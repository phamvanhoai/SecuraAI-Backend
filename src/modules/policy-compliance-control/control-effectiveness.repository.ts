import { auditWriter } from '../audit-security-reporting/audit-writer.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { z } from 'zod';
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
  updated_at: true,
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
  async evidenceBasis(controlIds: string[], assessmentIds: string[]) {
    if (!assessmentIds.length) return new Map<string, z.infer<typeof evidenceBasisSchema>>();
    const rows = await prisma.audit_logs.findMany({
      where: {
        resource_type: 'SECURITY_CONTROL',
        resource_id: { in: controlIds },
        action: { in: ['CONTROL_IMPLEMENTATION_ASSESSED', 'CONTROL_EFFECTIVENESS_ASSESSED'] },
        OR: assessmentIds.map((id) => ({ after_data: { path: ['assessmentId'], equals: id } })),
      },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      take: assessmentIds.length,
      select: { after_data: true },
    });
    const result = new Map<string, z.infer<typeof evidenceBasisSchema>>();
    for (const row of rows) {
      const parsed = z
        .object({ assessmentId: z.string(), evidenceBasis: evidenceBasisSchema })
        .safeParse(row.after_data);
      if (parsed.success && !result.has(parsed.data.assessmentId))
        result.set(parsed.data.assessmentId, parsed.data.evidenceBasis);
    }
    return result;
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
        await tx.$queryRaw`SELECT evidence.id FROM public.evidence_items AS evidence
          JOIN public.control_evidence_links AS link ON link.evidence_id = evidence.id
          WHERE link.control_id = ${controlId}::uuid ORDER BY evidence.id FOR SHARE OF evidence`;
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
        // Stop if applicability or implementation status changed after the service read the Control.
        if (
          control.applicability !== expected.applicability ||
          control.implementation_status !== expected.implementation_status
        )
          throw new AppError(
            409,
            'CONTROL_STALE',
            'Control configuration changed. Reload before assessing',
          );
        // Stop if no linked Evidence item is Active and valid now.
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
        // If the form sends its original status, stop when it no longer matches the saved status.
        if (
          input.expectedImplementationStatus &&
          input.expectedImplementationStatus !== control.implementation_status.toLowerCase()
        )
          throw new AppError(
            409,
            'CONTROL_STALE',
            'Implementation status changed. Close and reopen Assess Control before saving',
          );
        // Keep only the Evidence selected in the form and still linked to this Control.
        const selectedEvidence = control.control_evidence_links
          .filter((link) => input.evidenceIds.includes(link.evidence_items.id))
          .map((link) => link.evidence_items);
        if (
          // Stop if any selected Evidence is missing from the current links.
          selectedEvidence.length !== input.evidenceIds.length ||
          // At least one Evidence item must be selected.
          !selectedEvidence.length ||
          // Every selected Evidence item must be Active and valid now.
          selectedEvidence.some((item) => !isControlEvidenceUsable(item, new Date()))
        )
          throw new AppError(
            409,
            'CONTROL_EVIDENCE_STALE',
            'Selected Evidence is no longer linked or valid. Reopen Assess Control and select current Evidence.',
          );
        // Copy the selected Evidence details as the basis for this assessment.
        // This snapshot is saved in the audit log later, not by this map operation.
        const evidenceBasis = selectedEvidence
          .map((item) => ({
            id: item.id,
            name: item.name,
            source: item.source,
            collectedAt: item.collected_at.toISOString(),
            validFrom: item.valid_from?.toISOString() ?? null,
            validUntil: item.valid_until?.toISOString() ?? null,
          }))
          // Keep the same order even when the user selects Evidence in a different order.
          .sort((a, b) => a.id.localeCompare(b.id));
        // Use the status selected in the form and map it to the database enum.
        // If no status is submitted, keep the current saved status. This does not save it yet.
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
        // Only assess operating effectiveness for a Control that is Applicable.
        if (control.applicability !== 'APPLICABLE')
          throw new AppError(
            422,
            'CONTROL_NOT_APPLICABLE',
            'Only Applicable controls can be assessed for operating effectiveness. Update applicability and reopen Assess Control.',
          );
        // The Control must be deployed at least partly before its operation can be tested.
        // Planned and Not implemented statuses cannot pass this check.
        if (nextStatus !== 'PARTIALLY_IMPLEMENTED' && nextStatus !== 'IMPLEMENTED')
          throw new AppError(
            422,
            'CONTROL_NOT_DEPLOYED',
            'Operating effectiveness requires Partially implemented or Implemented status. Record actual deployment progress before saving.',
          );
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
        const after = {
          implementationStatus: nextStatus,
          assessmentId: assessment.id,
          evidenceBasis,
          reason: input.implementationChangeReason ?? null,
          result: input.result,
          effectiveness: input.effectiveness,
        };
        await auditWriter.record(
          {
            actorType: 'USER',
            actorUserId: actorId,
            source: 'API',
            action: changed ? 'CONTROL_IMPLEMENTATION_ASSESSED' : 'CONTROL_EFFECTIVENESS_ASSESSED',
            resourceType: 'SECURITY_CONTROL',
            resourceId: controlId,
            beforeData: { implementationStatus: control.implementation_status },
            afterData: after,
          },
          tx,
        );
        return assessment;
      },
      { maxWait: 5000, timeout: 15000 },
    );
  },
};
export type ControlEffectivenessRecord = Prisma.security_controlsGetPayload<{
  select: typeof controlSelect;
}>;

const evidenceBasisSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    source: z.string(),
    collectedAt: z.string(),
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
  }),
);

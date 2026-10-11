import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import type { CreateControlInput, EditControlInput } from './dto/manage-control.dto.js';
const select = {
  id: true,
  control_code: true,
  name: true,
  description: true,
  owner_user_id: true,
  applicability: true,
  implementation_status: true,
  created_at: true,
  updated_at: true,
  users_security_controls_owner_user_idTousers: {
    select: { id: true, full_name: true, status: true },
  },
  _count: { select: { control_assessments: true } },
} as const;
export type CatalogControl = Prisma.security_controlsGetPayload<{ select: typeof select }>;
async function withRevision(tx: Prisma.TransactionClient, control: CatalogControl) {
  const [clock] = await tx.$queryRaw<
    Array<{ version: string }>
  >`SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS version FROM public.security_controls WHERE id = ${control.id}::uuid`;
  if (!clock) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Security control not found');
  return {
    ...control,
    revision: createHash('sha256')
      .update(
        JSON.stringify({
          ...snapshot(control),
          clock: clock.version,
          assessments: control._count.control_assessments,
        }),
      )
      .digest('hex'),
  };
}
async function requireOfficer(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${actorId}::uuid FOR SHARE`;
  const actor = await tx.users.findUnique({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer required');
}
async function validateOwner(tx: Prisma.TransactionClient, ownerId: string | null) {
  if (!ownerId) return;
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${ownerId}::uuid FOR SHARE`;
  const owner = await tx.users.findUnique({
    where: { id: ownerId },
    select: { status: true, role: true },
  });
  if (!owner || owner.status !== 'ACTIVE' || !['EMPLOYEE', 'SECURITY_OFFICER'].includes(owner.role))
    throw new AppError(
      422,
      'INVALID_CONTROL_OWNER',
      'Select an active Employee or Security Officer',
    );
}
function values(input: CreateControlInput | EditControlInput) {
  return {
    name: input.name,
    description: input.description,
    owner_user_id: input.ownerUserId,
    applicability:
      input.applicability === 'applicable'
        ? ('APPLICABLE' as const)
        : input.applicability === 'not_applicable'
          ? ('NOT_APPLICABLE' as const)
          : ('UNDER_REVIEW' as const),
    implementation_status:
      input.implementationStatus === 'implemented'
        ? ('IMPLEMENTED' as const)
        : input.implementationStatus === 'planned'
          ? ('PLANNED' as const)
          : input.implementationStatus === 'partially_implemented'
            ? ('PARTIALLY_IMPLEMENTED' as const)
            : ('NOT_IMPLEMENTED' as const),
  };
}
function snapshot(control: CatalogControl) {
  return {
    controlCode: control.control_code,
    name: control.name,
    description: control.description,
    ownerUserId: control.owner_user_id,
    applicability: control.applicability,
    implementationStatus: control.implementation_status,
    updatedAt: control.updated_at.toISOString(),
  };
}
async function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  control: CatalogControl,
  before: CatalogControl | null,
  reason: string | null,
) {
  const id = randomUUID();
  const after = { ...snapshot(control), reason };
  await tx.audit_logs.create({
    data: {
      id,
      actor_type: 'USER',
      actor_user_id: actorId,
      source: 'API',
      action: before ? 'CONTROL_UPDATED' : 'CONTROL_CREATED',
      resource_type: 'SECURITY_CONTROL',
      resource_id: control.id,
      before_data: before ? snapshot(before) : Prisma.JsonNull,
      after_data: after,
      record_hash: createHash('sha256')
        .update(JSON.stringify({ id, actorId, after }))
        .digest('hex'),
    },
  });
}
export const controlCatalogRepository = {
  find(controlId: string) {
    return prisma.$transaction(
      async (tx) => {
        const control = await tx.security_controls.findUnique({ where: { id: controlId }, select });
        return control ? withRevision(tx, control) : null;
      },
      { isolationLevel: 'RepeatableRead' },
    );
  },
  owners(q: string) {
    return prisma.users.findMany({
      where: {
        status: 'ACTIVE',
        role: { in: ['EMPLOYEE', 'SECURITY_OFFICER'] },
        ...(q ? { full_name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      select: { id: true, full_name: true },
      orderBy: [{ full_name: 'asc' }, { id: 'asc' }],
      take: 10,
    });
  },
  create(actorId: string, input: CreateControlInput) {
    return prisma.$transaction(
      async (tx) => {
        await requireOfficer(tx, actorId);
        await validateOwner(tx, input.ownerUserId);
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.controlCode}))`;
        if (
          await tx.security_controls.findFirst({
            where: { control_code: { equals: input.controlCode, mode: 'insensitive' } },
            select: { id: true },
          })
        )
          throw new AppError(409, 'CONTROL_CODE_EXISTS', 'Control code is already in use');
        const control = await tx.security_controls.create({
          data: { ...values(input), control_code: input.controlCode, created_by: actorId },
          select,
        });
        await audit(tx, actorId, control, null, null);
        return withRevision(tx, control);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  },
  edit(actorId: string, controlId: string, input: EditControlInput) {
    return prisma.$transaction(
      async (tx) => {
        await requireOfficer(tx, actorId);
        await tx.$queryRaw`SELECT id FROM public.security_controls WHERE id = ${controlId}::uuid FOR UPDATE`;
        const before = await tx.security_controls.findUnique({ where: { id: controlId }, select });
        if (!before) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Security control not found');
        const current = await withRevision(tx, before);
        if (
          current.revision !== input.expectedRevision ||
          before.updated_at.getTime() !== new Date(input.expectedUpdatedAt).getTime()
        )
          throw new AppError(
            409,
            'CONTROL_STALE',
            'Control changed. Close and reopen Edit before saving',
          );
        const next = values(input);
        if (
          before._count.control_assessments > 0 &&
          (before.applicability !== next.applicability ||
            before.implementation_status !== next.implementation_status)
        )
          throw new AppError(
            409,
            'CONTROL_CONFIGURATION_LOCKED',
            'Applicability and implementation are locked after assessment; existing results must remain interpretable',
          );
        if (before.owner_user_id !== input.ownerUserId) await validateOwner(tx, input.ownerUserId);
        if (
          before.name === next.name &&
          before.description === next.description &&
          before.owner_user_id === next.owner_user_id &&
          before.applicability === next.applicability &&
          before.implementation_status === next.implementation_status
        )
          return current;
        const control = await tx.security_controls.update({
          where: { id: controlId },
          // The existing PostgreSQL trigger owns updated_at; revision retains its microseconds.
          data: next,
          select,
        });
        await audit(tx, actorId, control, before, input.reason);
        return withRevision(tx, control);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  },
};

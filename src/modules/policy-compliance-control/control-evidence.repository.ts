import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../common/errors/app-error.js';
import type {
  AddControlEvidence,
  LinkControlEvidence,
  ListControlEvidence,
  UnlinkControlEvidence,
} from './dto/control-evidence.dto.js';
import { evidenceDocumentUrlSchema } from './dto/control-evidence.dto.js';
import { isControlEvidenceUsable, usableControlEvidenceWhere } from './control-evidence.rules.js';

const select = {
  id: true,
  name: true,
  source: true,
  description: true,
  storage_uri: true,
  evidence_type: true,
  original_file_name: true,
  mime_type: true,
  file_size: true,
  integrity_hash: true,
  status: true,
  owner_user_id: true,
  collected_at: true,
  valid_from: true,
  valid_until: true,
  reviewed_at: true,
  created_at: true,
  users_evidence_items_owner_user_idTousers: { select: { id: true, full_name: true } },
  users_evidence_items_reviewed_byTousers: { select: { id: true, full_name: true } },
} as const;
type Evidence = Prisma.evidence_itemsGetPayload<{ select: typeof select }>;
type Access = {
  actorId: string;
  controlId: string;
  officer: boolean;
  control: { id: string; control_code: string; name: string };
};

function map(item: Evidence, now: Date) {
  const url = evidenceDocumentUrlSchema.safeParse(item.storage_uri);
  const usable = item.status === 'ACTIVE' && isControlEvidenceUsable(item, now);
  return {
    id: item.id,
    name: item.name,
    source: item.source,
    description: item.description,
    documentUrl: url.success ? url.data : null,
    evidenceType: item.evidence_type === 'UPLOADED_FILE' ? 'uploaded_file' : 'external_url',
    file:
      item.evidence_type === 'UPLOADED_FILE' && item.original_file_name
        ? {
            name: item.original_file_name,
            mimeType: item.mime_type,
            sizeBytes: item.file_size === null ? null : Number(item.file_size),
            sha256: item.integrity_hash,
            downloadUrl: `/api/v1/compliance/evidence/${item.id}/download`,
          }
        : null,
    status: item.status.toLowerCase(),
    usable,
    collectedAt: item.collected_at,
    validFrom: item.valid_from,
    validUntil: item.valid_until,
    owner: item.users_evidence_items_owner_user_idTousers
      ? {
          id: item.users_evidence_items_owner_user_idTousers.id,
          fullName: item.users_evidence_items_owner_user_idTousers.full_name,
        }
      : null,
    reviewedAt: item.reviewed_at,
    reviewedBy: item.users_evidence_items_reviewed_byTousers
      ? {
          id: item.users_evidence_items_reviewed_byTousers.id,
          fullName: item.users_evidence_items_reviewed_byTousers.full_name,
        }
      : null,
    createdAt: item.created_at,
  };
}
async function access(
  tx: Prisma.TransactionClient,
  actorId: string,
  controlId: string,
  write: boolean,
): Promise<Access> {
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${actorId}::uuid FOR SHARE`;
  const actor = await tx.users.findUnique({
    where: { id: actorId },
    select: { role: true, status: true },
  });
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (write)
    await tx.$queryRaw`SELECT id FROM public.security_controls WHERE id = ${controlId}::uuid FOR UPDATE`;
  const control = await tx.security_controls.findUnique({
    where: { id: controlId },
    select: { id: true, control_code: true, name: true, owner_user_id: true },
  });
  if (!control) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Security control not found');
  const officer = actor.role === 'SECURITY_OFFICER';
  if (!officer && !(actor.role === 'EMPLOYEE' && control.owner_user_id === actorId))
    throw new AppError(
      403,
      'FORBIDDEN',
      'Security Officer or assigned Employee Control Owner required',
    );
  return { actorId, controlId, officer, control };
}
function visible(access: Access): Prisma.evidence_itemsWhereInput {
  return access.officer
    ? {}
    : {
        OR: [
          { owner_user_id: access.actorId },
          {
            control_evidence_links: {
              some: { security_controls: { owner_user_id: access.actorId } },
            },
          },
        ],
      };
}
async function audit(
  tx: Prisma.TransactionClient,
  context: Access,
  evidenceId: string,
  action: string,
  reason: string,
  at: Date,
) {
  const id = randomUUID();
  const after = { controlId: context.controlId, evidenceId, reason };
  // Do not duplicate document URLs or evidence contents into logs.
  await tx.audit_logs.create({
    data: {
      id,
      actor_type: 'USER',
      actor_user_id: context.actorId,
      action,
      resource_type: 'SECURITY_CONTROL',
      resource_id: context.controlId,
      occurred_at: at,
      source: 'API',
      after_data: after,
      record_hash: createHash('sha256')
        .update(JSON.stringify({ id, actor: context.actorId, action, at: at.toISOString(), after }))
        .digest('hex'),
    },
  });
}
export const controlEvidenceRepository = {
  list(actorId: string, controlId: string, query: ListControlEvidence) {
    return prisma.$transaction(
      async (tx) => {
        const context = await access(tx, actorId, controlId, false);
        const now = new Date();
        const where: Prisma.evidence_itemsWhereInput = {
          AND: [
            visible(context),
            query.view === 'linked'
              ? { control_evidence_links: { some: { control_id: controlId } } }
              : {
                  ...usableControlEvidenceWhere(now),
                  control_evidence_links: { none: { control_id: controlId } },
                },
            ...(query.q
              ? [
                  {
                    OR: [
                      { name: { contains: query.q, mode: 'insensitive' as const } },
                      { source: { contains: query.q, mode: 'insensitive' as const } },
                    ],
                  },
                ]
              : []),
          ],
        };
        const [total, rows] = await Promise.all([
          tx.evidence_items.count({ where }),
          tx.evidence_items.findMany({
            where,
            select: {
              ...select,
              control_evidence_links: {
                where: { control_id: controlId },
                take: 1,
                select: { linked_at: true, users: { select: { id: true, full_name: true } } },
              },
            },
            orderBy: [{ collected_at: 'desc' }, { id: 'asc' }],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
          }),
        ]);
        return {
          control: {
            id: context.control.id,
            controlCode: context.control.control_code,
            name: context.control.name,
          },
          canAdd: true,
          canLink: true,
          items: rows.map((row) => ({
            ...map(row, now),
            linkedAt: row.control_evidence_links[0]?.linked_at ?? null,
            linkedBy: row.control_evidence_links[0]
              ? {
                  id: row.control_evidence_links[0].users.id,
                  fullName: row.control_evidence_links[0].users.full_name,
                }
              : null,
          })),
          pagination: {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
          },
        };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 },
    );
  },
  add(actorId: string, controlId: string, input: AddControlEvidence) {
    return prisma.$transaction(
      async (tx) => {
        const context = await access(tx, actorId, controlId, true);
        // Same requestId is safely replayable after an ambiguous network response.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.requestId}))`;
        const previous = await tx.evidence_items.findUnique({
          where: { id: input.requestId },
          select,
        });
        if (previous) {
          const linked = await tx.control_evidence_links.findUnique({
            where: { control_id_evidence_id: { control_id: controlId, evidence_id: previous.id } },
            select: { linked_by: true },
          });
          if (
            previous.owner_user_id !== actorId ||
            linked?.linked_by !== actorId ||
            previous.name !== input.name ||
            previous.source !== input.source ||
            previous.description !== input.description ||
            previous.storage_uri !== input.documentUrl ||
            previous.collected_at.getTime() !== new Date(input.collectedAt).getTime() ||
            (previous.valid_until?.getTime() ?? null) !==
              (input.validUntil ? new Date(input.validUntil).getTime() : null)
          )
            throw new AppError(
              409,
              'EVIDENCE_REQUEST_CONFLICT',
              'This request was already used for a different evidence record. Close and reopen the form',
            );
          return { evidence: map(previous, new Date()), created: false };
        }
        const now = new Date();
        const collectedAt = new Date(input.collectedAt);
        const validUntil = input.validUntil ? new Date(input.validUntil) : null;
        if (collectedAt > now)
          throw new AppError(
            422,
            'EVIDENCE_FUTURE_COLLECTION',
            'Collection time cannot be in the future',
          );
        if (validUntil && (validUntil <= now || validUntil <= collectedAt))
          throw new AppError(
            422,
            'EVIDENCE_INVALID_VALIDITY',
            'Validity must end after collection and the current time',
          );
        // Serialize matching document/version checks; still reject only visible duplicates.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.documentUrl}|${collectedAt.toISOString()}`}))`;
        if (
          await tx.evidence_items.findFirst({
            where: {
              AND: [
                visible(context),
                { storage_uri: input.documentUrl, collected_at: collectedAt },
              ],
            },
            select: { id: true },
          })
        )
          throw new AppError(
            409,
            'EVIDENCE_ALREADY_EXISTS',
            'This document and collection time already exist. Use Link existing evidence',
          );
        const item = await tx.evidence_items.create({
          data: {
            id: input.requestId,
            name: input.name,
            source: input.source,
            description: input.description,
            owner_user_id: actorId,
            storage_uri: input.documentUrl,
            evidence_type: 'EXTERNAL_URL',
            collected_at: collectedAt,
            valid_until: validUntil,
            status: 'ACTIVE',
          },
          select,
        });
        await tx.control_evidence_links.create({
          data: { control_id: controlId, evidence_id: item.id, linked_by: actorId, linked_at: now },
        });
        await audit(
          tx,
          context,
          item.id,
          'CONTROL_EVIDENCE_ADDED',
          'Registered new document reference and linked to control',
          now,
        );
        return { evidence: map(item, now), created: true };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  },
  addUploaded(
    actorId: string,
    controlId: string,
    input: {
      requestId: string;
      name: string;
      source: string;
      description: string;
      collectedAt: string;
      validUntil: string | null;
      storageKey: string;
      originalFileName: string;
      mimeType: string;
      sizeBytes: number;
      sha256: string;
    },
  ) {
    return prisma.$transaction(
      async (tx) => {
        const context = await access(tx, actorId, controlId, true);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.requestId}))`;
        const previous = await tx.evidence_items.findUnique({ where: { id: input.requestId }, select });
        if (previous) {
          const linked = await tx.control_evidence_links.findUnique({
            where: { control_id_evidence_id: { control_id: controlId, evidence_id: previous.id } },
            select: { linked_by: true },
          });
          if (
            previous.owner_user_id !== actorId ||
            linked?.linked_by !== actorId ||
            previous.evidence_type !== 'UPLOADED_FILE' ||
            previous.integrity_hash !== input.sha256 ||
            previous.storage_uri !== input.storageKey
          )
            throw new AppError(
              409,
              'EVIDENCE_REQUEST_CONFLICT',
              'This request was already used for a different evidence record. Close and reopen the form',
            );
          return { evidence: map(previous, new Date()), created: false };
        }
        const now = new Date();
        const collectedAt = new Date(input.collectedAt);
        const validUntil = input.validUntil ? new Date(input.validUntil) : null;
        if (collectedAt > now)
          throw new AppError(422, 'EVIDENCE_FUTURE_COLLECTION', 'Collection time cannot be in the future');
        if (validUntil && (validUntil <= now || validUntil <= collectedAt))
          throw new AppError(
            422,
            'EVIDENCE_INVALID_VALIDITY',
            'Validity must end after collection and the current time',
          );
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.sha256}))`;
        const duplicate = await tx.evidence_items.findFirst({
          where: { AND: [visible(context), { evidence_type: 'UPLOADED_FILE', integrity_hash: input.sha256 }] },
          select: { id: true },
        });
        if (duplicate)
          throw new AppError(
            409,
            'EVIDENCE_FILE_ALREADY_EXISTS',
            'This file already exists. Use Link existing evidence',
          );
        const item = await tx.evidence_items.create({
          data: {
            id: input.requestId,
            name: input.name,
            source: input.source,
            description: input.description,
            owner_user_id: actorId,
            storage_uri: input.storageKey,
            evidence_type: 'UPLOADED_FILE',
            original_file_name: input.originalFileName,
            mime_type: input.mimeType,
            file_size: BigInt(input.sizeBytes),
            integrity_hash: input.sha256,
            collected_at: collectedAt,
            valid_until: validUntil,
            status: 'ACTIVE',
          },
          select,
        });
        await tx.control_evidence_links.create({
          data: { control_id: controlId, evidence_id: item.id, linked_by: actorId, linked_at: now },
        });
        await audit(
          tx,
          context,
          item.id,
          'CONTROL_EVIDENCE_FILE_UPLOADED',
          'Uploaded private evidence file and linked to control',
          now,
        );
        return { evidence: map(item, now), created: true };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  },
  getUploadedFile(actorId: string, evidenceId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${actorId}::uuid FOR SHARE`;
      const actor = await tx.users.findUnique({ where: { id: actorId }, select: { role: true, status: true } });
      if (!actor || actor.status !== 'ACTIVE')
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      const item = await tx.evidence_items.findFirst({
        where: {
          id: evidenceId,
          evidence_type: 'UPLOADED_FILE',
          ...(actor.role === 'SECURITY_OFFICER'
            ? {}
            : actor.role === 'EMPLOYEE'
              ? {
                  OR: [
                    { owner_user_id: actorId },
                    { control_evidence_links: { some: { security_controls: { owner_user_id: actorId } } } },
                  ],
                }
              : { id: '__not_accessible__' }),
        },
        select: {
          id: true,
          storage_uri: true,
          original_file_name: true,
          mime_type: true,
          integrity_hash: true,
        },
      });
      if (!item?.storage_uri || !item.original_file_name || !item.mime_type || !item.integrity_hash)
        throw new AppError(404, 'EVIDENCE_FILE_NOT_FOUND', 'Evidence file not found or not accessible');
      return {
        id: item.id,
        storageKey: item.storage_uri,
        fileName: item.original_file_name,
        mimeType: item.mime_type,
        sha256: item.integrity_hash,
      };
    });
  },
  async recordFileDownload(actorId: string, evidenceId: string) {
    const id = randomUUID();
    const at = new Date();
    const after = { evidenceId };
    await prisma.audit_logs.create({
      data: {
        id,
        actor_type: 'USER',
        actor_user_id: actorId,
        action: 'CONTROL_EVIDENCE_FILE_DOWNLOADED',
        resource_type: 'EVIDENCE',
        resource_id: evidenceId,
        occurred_at: at,
        source: 'API',
        after_data: after,
        record_hash: createHash('sha256')
          .update(JSON.stringify({ id, actor: actorId, action: 'CONTROL_EVIDENCE_FILE_DOWNLOADED', at: at.toISOString(), after }))
          .digest('hex'),
      },
    });
  },
  link(actorId: string, controlId: string, input: LinkControlEvidence) {
    return prisma.$transaction(
      async (tx) => {
        const context = await access(tx, actorId, controlId, true);
        // Lock the source row; Serializable also protects ownership/link predicates.
        await tx.$queryRaw`SELECT id FROM public.evidence_items WHERE id = ${input.evidenceId}::uuid FOR UPDATE`;
        const item = await tx.evidence_items.findFirst({
          where: { AND: [visible(context), { id: input.evidenceId }] },
          select,
        });
        if (!item)
          throw new AppError(404, 'EVIDENCE_NOT_AVAILABLE', 'Evidence not found or not accessible');
        const now = new Date();
        if (item.status !== 'ACTIVE' || !isControlEvidenceUsable(item, now))
          throw new AppError(
            409,
            'EVIDENCE_NOT_USABLE',
            'Evidence is inactive, expired or not yet valid. Select another item',
          );
        const existing = await tx.control_evidence_links.findUnique({
          where: { control_id_evidence_id: { control_id: controlId, evidence_id: item.id } },
          select: { evidence_id: true },
        });
        if (existing) return { evidence: map(item, now), linked: false };
        await tx.control_evidence_links.create({
          data: { control_id: controlId, evidence_id: item.id, linked_by: actorId, linked_at: now },
        });
        await audit(tx, context, item.id, 'CONTROL_EVIDENCE_LINKED', input.reason, now);
        return { evidence: map(item, now), linked: true };
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
    );
  },
  unlink(actorId: string, controlId: string, evidenceId: string, input: UnlinkControlEvidence) {
    return prisma.$transaction(
      async (tx) => {
        const context = await access(tx, actorId, controlId, true);
        const link = await tx.control_evidence_links.findUnique({
          where: { control_id_evidence_id: { control_id: controlId, evidence_id: evidenceId } },
          select: { evidence_id: true },
        });
        if (!link) throw new AppError(404, 'EVIDENCE_LINK_NOT_FOUND', 'Evidence is not linked to this Control');
        await tx.control_evidence_links.delete({
          where: { control_id_evidence_id: { control_id: controlId, evidence_id: evidenceId } },
        });
        await audit(tx, context, evidenceId, 'CONTROL_EVIDENCE_UNLINKED', input.reason, new Date());
        return { unlinked: true };
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
    );
  },
};

import { createHash } from 'node:crypto';
import type { audit_actor_type, audit_logs, audit_outcome, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { getRequestContext, normalizeClientIp } from '../../common/middleware/request-context.js';

export type RecordAuditInput = {
  actorUserId?: string | null | undefined;
  actorApiKeyId?: string | null | undefined;
  actorType?: audit_actor_type | undefined;
  action: string;
  resourceType: string;
  resourceId?: string | null | undefined;
  beforeData?: Record<string, unknown> | null | undefined;
  afterData?: Record<string, unknown> | null | undefined;
  outcome?: audit_outcome | undefined;
  errorCode?: string | null | undefined;
  source?: string | undefined;
  sourceIp?: string | null | undefined;
  userAgent?: string | null | undefined;
  correlationId?: string | null | undefined;
  occurredAt?: Date | undefined;
};

export const auditWriter = {
  /**
   * Appends an audit log record with automatic IP/User-Agent extraction from RequestContext
   * and SHA-256 integrity hash chaining linked to the previous audit log record.
   *
   * @param input Audit entry details. If sourceIp or userAgent are omitted, they are
   *              automatically resolved from the active AsyncLocalStorage RequestContext.
   * @param tx Optional Prisma transaction client. If omitted, uses the root prisma client.
   */
  async record(
    input: RecordAuditInput,
    tx?: Prisma.TransactionClient,
  ): Promise<audit_logs> {
    const db = tx ?? prisma;
    const context = getRequestContext();

    const actorType: audit_actor_type =
      input.actorType ??
      (input.actorUserId ? 'USER' : input.actorApiKeyId ? 'API_KEY' : 'SYSTEM');

    const outcome: audit_outcome = input.outcome ?? 'SUCCESS';
    const source = input.source ?? 'API';

    const rawIp = input.sourceIp !== undefined ? input.sourceIp : context?.sourceIp;
    const resolvedIp = normalizeClientIp(rawIp ?? undefined) ?? null;

    const resolvedUserAgent =
      input.userAgent !== undefined ? input.userAgent : (context?.userAgent ?? null);

    const resolvedCorrelationId =
      input.correlationId !== undefined ? input.correlationId : (context?.correlationId ?? null);

    const occurredAt = input.occurredAt ?? new Date();

    const previous = await db.audit_logs.findFirst({
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      select: { record_hash: true },
    });

    const recordHash = createHash('sha256')
      .update(
        JSON.stringify({
          previousHash: previous?.record_hash ?? null,
          actorUserId: input.actorUserId ?? null,
          actorApiKeyId: input.actorApiKeyId ?? null,
          actorType,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          outcome,
          errorCode: input.errorCode ?? null,
          beforeData: input.beforeData ?? null,
          afterData: input.afterData ?? null,
          occurredAt: occurredAt.toISOString(),
        }),
      )
      .digest('hex');

    return db.audit_logs.create({
      data: {
        actor_user_id: input.actorUserId ?? null,
        actor_api_key_id: input.actorApiKeyId ?? null,
        actor_type: actorType,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        occurred_at: occurredAt,
        source,
        outcome,
        ...(input.errorCode ? { error_code: input.errorCode } : {}),
        ...(input.beforeData ? { before_data: input.beforeData as Prisma.InputJsonValue } : {}),
        ...(input.afterData ? { after_data: input.afterData as Prisma.InputJsonValue } : {}),
        ...(resolvedIp ? { source_ip: resolvedIp.slice(0, 45) } : {}),
        ...(resolvedUserAgent ? { user_agent: resolvedUserAgent.slice(0, 500) } : {}),
        ...(resolvedCorrelationId ? { correlation_id: resolvedCorrelationId.slice(0, 255) } : {}),
        ...(previous?.record_hash ? { previous_hash: previous.record_hash } : {}),
        record_hash: recordHash,
      },
    });
  },
};


import { z } from 'zod';

export const auditActorTypes = ['USER', 'SYSTEM', 'API_KEY'] as const;

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  actor: z.string().trim().max(100).optional(),
  actorType: z.enum(auditActorTypes).optional(),
  action: z.string().trim().max(100).optional(),
  resourceType: z.string().trim().max(100).optional(),
  correlationId: z.string().trim().max(100).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sortBy: z
    .enum(['occurredAt', 'action', 'resourceType', 'actorType', 'sourceIp', 'createdAt'])
    .default('occurredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

export type AuditLogActorDto = {
  id: string;
  type: (typeof auditActorTypes)[number];
  name: string;
  email?: string | null;
  role?: string | null;
  keyPrefix?: string | null;
};

export type AuditLogItemDto = {
  id: string;
  actorType: (typeof auditActorTypes)[number];
  actorUserId: string | null;
  actorApiKeyId: string | null;
  actor: AuditLogActorDto | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  occurredAt: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  correlationId: string | null;
  source: string | null;
  sourceIp: string | null;
  userAgent: string | null;
  previousHash: string | null;
  recordHash: string;
  createdAt: string;
};

export type AuditLogListResponseDto = {
  items: AuditLogItemDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export const getAuditLogParamsSchema = z.object({
  id: z.string().uuid(),
});

export type GetAuditLogParams = z.infer<typeof getAuditLogParamsSchema>;

export const propertyChangeTypes = ['ADDED', 'MODIFIED', 'REMOVED', 'UNCHANGED'] as const;
export type PropertyChangeType = (typeof propertyChangeTypes)[number];

export type PropertyChangeDto = {
  property: string;
  changeType: PropertyChangeType;
  beforeValue: unknown;
  afterValue: unknown;
};

export type AuditLogDiffDto = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  occurredAt: string;
  totalProperties: number;
  totalModified: number;
  totalAdded: number;
  totalRemoved: number;
  totalUnchanged: number;
  hasChanges: boolean;
  changes: PropertyChangeDto[];
};

export function computePropertyChanges(
  beforeData: Record<string, unknown> | null,
  afterData: Record<string, unknown> | null,
): PropertyChangeDto[] {
  const before = beforeData ?? {};
  const after = afterData ?? {};
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();

  return allKeys.map((key) => {
    const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
    const beforeVal = hasBefore ? before[key] : undefined;
    const afterVal = hasAfter ? after[key] : undefined;

    let changeType: PropertyChangeType;
    if (!hasBefore && hasAfter) {
      changeType = 'ADDED';
    } else if (hasBefore && !hasAfter) {
      changeType = 'REMOVED';
    } else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changeType = 'MODIFIED';
    } else {
      changeType = 'UNCHANGED';
    }

    return {
      property: key,
      changeType,
      beforeValue: beforeVal ?? null,
      afterValue: afterVal ?? null,
    };
  });
}


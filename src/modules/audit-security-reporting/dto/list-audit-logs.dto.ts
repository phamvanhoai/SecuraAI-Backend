import { z } from 'zod';

export const auditActorTypes = ['USER', 'SYSTEM', 'API_KEY'] as const;

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
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

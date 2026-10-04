import { z } from 'zod';

export const eventFamilies = ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'] as const;
export const mappingStatuses = ['UNMAPPED', 'PARTIALLY_MAPPED', 'MAPPED', 'NEEDS_REVIEW'] as const;

export const listNormalizedEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z
    .enum([
      'occurredAt',
      'ingestedAt',
      'eventType',
      'eventFamily',
      'severity',
      'mappingStatus',
    ])
    .default('occurredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  q: z.string().trim().min(1).optional(),
  eventSourceId: z.string().uuid().optional(),
  eventFamily: z.enum(eventFamilies).optional(),
  mappingStatus: z.enum(mappingStatuses).optional(),
  severity: z.string().trim().min(1).optional(),
  eventType: z.string().trim().min(1).optional(),
  sourceIp: z.string().trim().min(1).optional(),
  account: z.string().trim().min(1).optional(),
  assetId: z.string().uuid().optional(),
  asset: z.string().trim().min(1).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  startDate: z.string().trim().min(1).optional(),
  endDate: z.string().trim().min(1).optional(),
});

export type ListNormalizedEventsQuery = z.infer<typeof listNormalizedEventsQuerySchema>;

export const eventIdParamSchema = z.object({
  id: z.string().uuid('Invalid event ID format'),
});

export type EventIdParam = z.infer<typeof eventIdParamSchema>;

export type MappedUserDto = {
  id: string;
  email: string;
  fullName: string | null;
};

export type MappedAssetDto = {
  id: string;
  name: string;
  assetCode: string;
  assetType: string;
  criticality: string;
};

export type MonitoredAccountSummaryDto = {
  id: string;
  accountIdentifier: string;
  sourceSystem: string;
  displayName?: string | null;
};

export type EntityMappingDto = {
  id: string;
  eventId: string;
  userId: string | null;
  monitoredAccountId: string | null;
  assetId: string | null;
  mappingMethod: 'AUTO' | 'MANUAL';
  confidence: number | null;
  reason: string | null;
  mappedBy: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  mappedAt: Date;
  isActive: boolean;
  supersedesMappingId: string | null;
  mappedUser: MappedUserDto | null;
  mappedAsset: MappedAssetDto | null;
  monitoredAccount: MonitoredAccountSummaryDto | null;
  createdAt: Date;
};

export const updateEntityMappingSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  assetId: z.string().uuid().nullable().optional(),
  monitoredAccountId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(1, 'Reason for correction is required').max(500),
  confidence: z.coerce.number().min(0).max(1).optional().default(1.0),
});

export type UpdateEntityMappingDto = z.infer<typeof updateEntityMappingSchema>;

export type MappingOptionsDto = {
  users: Array<{
    id: string;
    email: string;
    fullName: string | null;
  }>;
  assets: Array<{
    id: string;
    name: string;
    assetCode: string;
    assetType: string;
    criticality: string | null;
  }>;
  monitoredAccounts: Array<{
    id: string;
    accountIdentifier: string;
    sourceSystem: string;
    displayName: string | null;
  }>;
};

export type NormalizedEventItemDto = {
  id: string;
  eventSourceId: string;
  eventSourceName: string;
  eventSourceType: string;
  ingestionBatchId: string | null;
  externalEventId: string | null;
  eventFamily: (typeof eventFamilies)[number];
  eventType: string;
  schemaVersion: string | null;
  occurredAt: Date;
  ingestedAt: Date;
  accountIdentifier: string | null;
  sourceIp: string | null;
  destinationIp: string | null;
  deviceIdentifier: string | null;
  severity: string | null;
  mappingStatus: (typeof mappingStatuses)[number];
  mappedUser: MappedUserDto | null;
  mappedAsset: MappedAssetDto | null;
  anomalyCount: number;
  createdAt: Date;
};

export type NormalizedEventDetailDto = NormalizedEventItemDto & {
  normalizedPayload: Record<string, unknown>;
  activeMapping: EntityMappingDto | null;
  mappingHistory: EntityMappingDto[];
  anomalyDetections?: Array<{
    id: string;
    anomalyScore: number;
    threshold: number;
    isAnomaly: boolean;
    detectedAt: Date;
  }>;
};

export type PaginatedNormalizedEventsDto = {
  items: NormalizedEventItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type NormalizedEventMetricsDto = {
  totalEvents: number;
  totalMapped: number;
  totalUnmapped: number;
  eventsLast24Hours: number;
  byFamily: {
    AUTHENTICATION: number;
    VPN_SSO: number;
    APPLICATION_ACCESS: number;
  };
};

import { z } from 'zod';

export const eventFamilies = ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'] as const;
export const mappingStatuses = ['UNMAPPED', 'PARTIALLY_MAPPED', 'MAPPED', 'NEEDS_REVIEW'] as const;

export const listNormalizedEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['occurredAt', 'ingestedAt', 'eventType', 'eventFamily', 'severity', 'mappingStatus']).default('occurredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListNormalizedEventsQuery = z.infer<typeof listNormalizedEventsQuerySchema>;

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

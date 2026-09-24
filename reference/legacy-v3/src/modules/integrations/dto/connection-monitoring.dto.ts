import { z } from 'zod';

export const queryConnectionMonitoringSchema = z.object({
  timeWindow: z.enum(['24h', '7d']).optional().default('24h'),
});

export type QueryConnectionMonitoringDto = z.infer<typeof queryConnectionMonitoringSchema>;

export const batchConnectionCheckSchema = z.object({
  integrationIds: z.array(z.string().uuid('Invalid integration ID format')).max(50).optional(),
  timeoutMs: z.number().int().min(1000, 'Timeout must be at least 1000ms').max(10000, 'Timeout cannot exceed 10000ms').optional(),
});

export type BatchConnectionCheckDto = z.infer<typeof batchConnectionCheckSchema>;

export type ConnectionLogEntryDto = {
  id: string;
  integrationId: string;
  integrationName?: string | undefined;
  level: string;
  message: string;
  createdAt: Date;
  latencyMs: number | null;
  httpStatus: number | null;
  success: boolean | null;
  errorCode: string | null;
};

export type FailingIntegrationDto = {
  id: string;
  name: string;
  integrationType: string;
  baseUrl: string | null;
  status: string;
  lastConnectedAt: Date | null;
  lastErrorMessage: string | null;
  lastCheckedAt: Date | null;
};

export type ConnectionStatusSummaryDto = {
  totalIntegrations: number;
  activeCount: number;
  errorCount: number;
  inactiveCount: number;
  pendingCount: number;
  timeWindow: string;
  checks24h: number;
  successfulChecks24h: number;
  failedChecks24h: number;
  availability24h: number | null;
  averageLatency24h: number | null;
  failingIntegrations: FailingIntegrationDto[];
  recentLogs: ConnectionLogEntryDto[];
};

export type SingleCheckProbeResult = {
  integrationId: string;
  name: string;
  connected: boolean;
  statusCode: number | null;
  latencyMs: number;
  message: string;
  provider?: string | undefined;
  details?: Record<string, unknown> | undefined;
};

export type BatchConnectionCheckResultDto = {
  totalTested: number;
  successful: number;
  failed: number;
  results: SingleCheckProbeResult[];
};

export type IntegrationConnectionStatusDto = {
  id: string;
  name: string;
  integrationType: string;
  baseUrl: string | null;
  status: string;
  lastConnectedAt: Date | null;
  timeWindow: string;
  checks24h: number;
  successfulChecks24h: number;
  failedChecks24h: number;
  availability24h: number | null;
  averageLatency24h: number | null;
  recentLogs: ConnectionLogEntryDto[];
};

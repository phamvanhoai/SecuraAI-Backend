import { z } from 'zod';
import { eventFamilies } from './list-normalized-events.dto.js';
import type { EventFamily } from './event-governance-policy.dto.js';

export const runRetentionPurgeBodySchema = z.preprocess(
  (value) => (value === undefined ? {} : value),
  z
    .object({
      dryRun: z.boolean().default(false),
      eventFamily: z.enum(eventFamilies).optional(),
      batchSize: z.number().int().min(10).max(1000).optional(),
      maxBatches: z.number().int().min(1).max(100).optional(),
    })
    .strict(),
);

export type RunRetentionPurgeBody = z.infer<typeof runRetentionPurgeBodySchema>;

export type EffectiveRetentionReason =
  | 'ACTIVE_POLICY'
  | 'DELETION_DISABLED'
  | 'NO_ACTIVE_POLICY';

export type EffectiveFamilyRetentionPolicyDto = {
  eventFamily: EventFamily;
  eligible: boolean;
  reason: EffectiveRetentionReason;
  retentionDays: number | null;
  cutoffDate: string | null;
  policyIds: string[];
  policyNames: string[];
};

export type RetentionPurgeFamilyResultDto = {
  eventFamily: EventFamily;
  eligible: boolean;
  reason: EffectiveRetentionReason;
  retentionDays: number | null;
  cutoffDate: string | null;
  policyIds: string[];
  batchesExecuted: number;
  deletedNormalizedEvents: number;
  deletedDetections: number;
  deletedFeatureContributions: number;
  deletedMappings: number;
  deletedDetectionJobs: number;
  deletedInvalidEvents: number;
  protectedByAlertOrIncident: number;
  hasMore: boolean;
};

export type RetentionPurgeRunResultDto = {
  status: 'COMPLETED' | 'DRY_RUN' | 'SKIPPED_LOCKED';
  trigger: 'SCHEDULED' | 'MANUAL';
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalDeletedNormalizedEvents: number;
  totalDeletedInvalidEvents: number;
  totalProtectedEvents: number;
  families: RetentionPurgeFamilyResultDto[];
};

export type RetentionPurgeHistoryItemDto = {
  id: string;
  occurredAt: string;
  actorType: string;
  actorUserId: string | null;
  source: string | null;
  outcome: string;
  summary: Record<string, unknown> | null;
};

export type RetentionPurgeStatusDto = {
  enabled: boolean;
  workerActive: boolean;
  running: boolean;
  intervalMs: number;
  batchSize: number;
  maxBatchesPerRun: number;
  runOnStartup: boolean;
  effectivePolicies: EffectiveFamilyRetentionPolicyDto[];
  lastRun: RetentionPurgeRunResultDto | null;
  recentRuns: RetentionPurgeHistoryItemDto[];
};

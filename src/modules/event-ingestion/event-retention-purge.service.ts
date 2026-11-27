import type { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../common/errors/app-error.js';
import { auditWriter } from '../audit-security-reporting/audit-writer.js';
import { eventGovernanceRepository } from './event-governance.repository.js';
import {
  eventRetentionPurgeRepository,
  type ActiveRetentionPolicyRecord,
} from './event-retention-purge.repository.js';
import { eventFamilies } from './dto/list-normalized-events.dto.js';
import type { EventFamily } from './dto/event-governance-policy.dto.js';
import type {
  EffectiveFamilyRetentionPolicyDto,
  RetentionPurgeFamilyResultDto,
  RetentionPurgeHistoryItemDto,
  RetentionPurgeRunResultDto,
  RetentionPurgeStatusDto,
  RunRetentionPurgeBody,
} from './dto/retention-purge.dto.js';

const MS_PER_DAY = 86_400_000;

let inProcessRunning = false;
let lastRunResult: RetentionPurgeRunResultDto | null = null;

/**
 * Resolves the effective retention and automated-deletion posture for each event family.
 * Family-specific active policies take precedence over global (null event_family) policies.
 * Within the winning tier, automated deletion is disabled if any applicable policy disables it,
 * and the longest retention period applies so no active policy's retention guarantee is violated.
 */
export function resolveEffectiveRetentionPolicies(
  activePolicies: readonly ActiveRetentionPolicyRecord[],
  now: Date = new Date(), // Get current date and time
): EffectiveFamilyRetentionPolicyDto[] { // Return effective retention policies
  const onlyActive = activePolicies.filter((policy) => policy.status === 'ACTIVE'); // Filter active policies

  return eventFamilies.map((family) => { // Map over all event families
    const familySpecific = onlyActive.filter((policy) => policy.event_family === family); // Filter family-specific policies
    const globalPolicies = onlyActive.filter((policy) => policy.event_family === null); // Filter global policies
    const applicable = familySpecific.length > 0 ? familySpecific : globalPolicies; // Family-specific policies take precedence over global policies

    if (applicable.length === 0) { // If no applicable policies
      return {
        eventFamily: family,
        eligible: false,
        reason: 'NO_ACTIVE_POLICY',
        retentionDays: null,
        cutoffDate: null,
        policyIds: [],
        policyNames: [],
      };
    }

    const retentionDays = Math.max(...applicable.map((policy) => policy.retention_days)); // Find longest retention period
    const cutoffDate = new Date(now.getTime() - retentionDays * MS_PER_DAY).toISOString(); // Calculate cutoff date
    const policyIds = applicable.map((policy) => policy.id); // Get all policy IDs
    const policyNames = applicable.map((policy) => policy.name); // Get all policy names
    const deletionBlocked = applicable.some((policy) => !policy.deletion_enabled); // Check if deletion is disabled

    return {
      eventFamily: family,
      eligible: !deletionBlocked,
      reason: deletionBlocked ? 'DELETION_DISABLED' : 'ACTIVE_POLICY',
      retentionDays,
      cutoffDate,
      policyIds,
      policyNames,
    };
  });
}
// Check if user is governance admin
async function requireGovernanceAdmin(userId: string) {
  const actor = await eventGovernanceRepository.findActorUser(userId); // Find actor user
  if (!actor || actor.status !== 'ACTIVE') { // Check if actor is valid and active
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or inactive user session');
  }

  if (actor.role !== 'ADMIN') { // Check if actor is admin
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only System Administrators can inspect or execute retention purge jobs',
    );
  }

  return actor;
}
// Convert value to JSON record
function asJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
// Map audit log to history item
function mapHistoryItem(
  record: Awaited<ReturnType<typeof eventRetentionPurgeRepository.findRecentPurgeAuditLogs>>[number],
): RetentionPurgeHistoryItemDto {
  return {
    id: record.id,
    occurredAt: record.occurred_at.toISOString(),
    actorType: record.actor_type,
    actorUserId: record.actor_user_id,
    source: record.source,
    outcome: record.outcome,
    summary: asJsonRecord(record.after_data),
  };
}
// Create skipped locked result
function createSkippedLockedResult(
  trigger: 'SCHEDULED' | 'MANUAL',
  dryRun: boolean,
  startedAt: Date,
): RetentionPurgeRunResultDto {
  const completedAt = new Date();
  return {
    status: 'SKIPPED_LOCKED',
    trigger,
    dryRun,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    totalDeletedNormalizedEvents: 0,
    totalDeletedInvalidEvents: 0,
    totalProtectedEvents: 0,
    families: [],
  };
}
// Create ineligible family result
function createIneligibleFamilyResult(
  policy: EffectiveFamilyRetentionPolicyDto,
): RetentionPurgeFamilyResultDto {
  return {
    eventFamily: policy.eventFamily,
    eligible: false,
    reason: policy.reason,
    retentionDays: policy.retentionDays,
    cutoffDate: policy.cutoffDate,
    policyIds: policy.policyIds,
    batchesExecuted: 0,
    deletedNormalizedEvents: 0,
    deletedDetections: 0,
    deletedFeatureContributions: 0,
    deletedMappings: 0,
    deletedDetectionJobs: 0,
    deletedInvalidEvents: 0,
    protectedByAlertOrIncident: 0,
    hasMore: false,
  };
}
// Purge eligible family
async function purgeEligibleFamily(
  policy: EffectiveFamilyRetentionPolicyDto,
  batchSize: number,
  maxBatches: number,
  tx: Prisma.TransactionClient,
): Promise<RetentionPurgeFamilyResultDto> {
  if (!policy.eligible || !policy.cutoffDate) {
    return createIneligibleFamilyResult(policy);
  }

  const cutoffDate = new Date(policy.cutoffDate);
  let batchesExecuted = 0;
  let deletedNormalizedEvents = 0;
  let deletedDetections = 0;
  let deletedFeatureContributions = 0;
  let deletedMappings = 0;
  let deletedDetectionJobs = 0;
  let normalizedHitCap = false;
  // Loop through batches for normalized events
  for (let batch = 0; batch < maxBatches; batch++) {
    const counts = await eventRetentionPurgeRepository.purgeNormalizedEventsBatch(
      policy.eventFamily,
      cutoffDate,
      batchSize,
      tx,
    );
    if (counts.deletedEvents === 0) break; // Break if no deleted events

    batchesExecuted++;
    deletedNormalizedEvents += counts.deletedEvents; // Add deleted events to total
    deletedDetections += counts.deletedDetections; // Add deleted detections to total
    deletedFeatureContributions += counts.deletedFeatureContributions; // Add deleted feature contributions to total
    deletedMappings += counts.deletedMappings; // Add deleted mappings to total
    deletedDetectionJobs += counts.deletedDetectionJobs; // Add deleted detection jobs to total

    if (counts.deletedEvents < batchSize) break; // Break if no deleted events
    if (batch === maxBatches - 1) normalizedHitCap = true; // Set normalized hit cap if batch is the last batch
  }

  let deletedInvalidEvents = 0;
  let invalidHitCap = false;
  // Loop through batches for invalid events
  for (let batch = 0; batch < maxBatches; batch++) {
    const deleted = await eventRetentionPurgeRepository.purgeInvalidEventsBatch(
      policy.eventFamily,
      cutoffDate,
      batchSize,
      tx,
    );
    if (deleted === 0) break; // Break if no deleted events

    batchesExecuted++;
    deletedInvalidEvents += deleted; // Add deleted events to total

    if (deleted < batchSize) break; // Break if no deleted events
    if (batch === maxBatches - 1) invalidHitCap = true; // Set invalid hit cap if batch is the last batch
  }

  // Count protected normalized events
  const protectedByAlertOrIncident =
    await eventRetentionPurgeRepository.countProtectedNormalizedEvents(
      policy.eventFamily,
      cutoffDate,
      tx,
    );

  return {
    eventFamily: policy.eventFamily,
    eligible: true,
    reason: policy.reason,
    retentionDays: policy.retentionDays,
    cutoffDate: policy.cutoffDate,
    policyIds: policy.policyIds,
    batchesExecuted,
    deletedNormalizedEvents,
    deletedDetections,
    deletedFeatureContributions,
    deletedMappings,
    deletedDetectionJobs,
    deletedInvalidEvents,
    protectedByAlertOrIncident,
    hasMore: normalizedHitCap || invalidHitCap,
  };
}
// Preview eligible family
async function previewEligibleFamily(
  policy: EffectiveFamilyRetentionPolicyDto,
  tx: Prisma.TransactionClient,
): Promise<RetentionPurgeFamilyResultDto> {
  if (!policy.eligible || !policy.cutoffDate) {
    return createIneligibleFamilyResult(policy);
  }

  const cutoffDate = new Date(policy.cutoffDate);
  // Count eligible normalized events
  const eligibleNormalized = await eventRetentionPurgeRepository.countEligibleNormalizedEvents(
    policy.eventFamily,
    cutoffDate,
    tx,
  );
  // Count protected normalized events
  const protectedNormalized = await eventRetentionPurgeRepository.countProtectedNormalizedEvents(
    policy.eventFamily,
    cutoffDate,
    tx,
  );
  // Count eligible invalid events
  const eligibleInvalid = await eventRetentionPurgeRepository.countEligibleInvalidEvents(
    policy.eventFamily,
    cutoffDate,
    tx,
  );

  return {
    eventFamily: policy.eventFamily,
    eligible: true,
    reason: policy.reason,
    retentionDays: policy.retentionDays,
    cutoffDate: policy.cutoffDate,
    policyIds: policy.policyIds,
    batchesExecuted: 0,
    deletedNormalizedEvents: eligibleNormalized,
    deletedDetections: 0,
    deletedFeatureContributions: 0,
    deletedMappings: 0,
    deletedDetectionJobs: 0,
    deletedInvalidEvents: eligibleInvalid,
    protectedByAlertOrIncident: protectedNormalized,
    hasMore: false,
  };
}

type ExecutePurgeInput = {
  actor: { type: 'USER'; userId: string } | { type: 'SYSTEM' };
  trigger: 'SCHEDULED' | 'MANUAL';
  dryRun: boolean;
  eventFamily?: EventFamily | undefined;
  batchSize?: number | undefined;
  maxBatches?: number | undefined;
};
// Execute purge
async function executePurge(input: ExecutePurgeInput): Promise<RetentionPurgeRunResultDto> {
  const startedAt = new Date();
  if (inProcessRunning) {
    if (input.trigger === 'MANUAL') {
      throw new AppError(
        409,
        'PURGE_ALREADY_RUNNING',
        'A retention purge job is already running in this instance',
      );
    }
    return createSkippedLockedResult(input.trigger, input.dryRun, startedAt);
  }

  inProcessRunning = true;
  // Try to acquire the purge lock
  try {
    const batchSize = input.batchSize ?? env.RETENTION_PURGE_BATCH_SIZE;
    const maxBatches = input.maxBatches ?? env.RETENTION_PURGE_MAX_BATCHES_PER_RUN;

    const lockResult = await eventRetentionPurgeRepository.withPurgeLock(async (tx) => {
      const activePolicies = await eventRetentionPurgeRepository.findActiveGovernancePolicies(tx);
      const resolvedPolicies = resolveEffectiveRetentionPolicies(activePolicies, startedAt);
      const targetPolicies = input.eventFamily
        ? resolvedPolicies.filter((policy) => policy.eventFamily === input.eventFamily)
        : resolvedPolicies;

      const results: RetentionPurgeFamilyResultDto[] = [];
      for (const policy of targetPolicies) {
        const familyResult = input.dryRun
          ? await previewEligibleFamily(policy, tx)
          : await purgeEligibleFamily(policy, batchSize, maxBatches, tx);
        results.push(familyResult);
      }

      return results;
    });
    // Check if purge lock was acquired
    if (!lockResult.acquired) {
      if (input.trigger === 'MANUAL') {
        throw new AppError(
          409,
          'PURGE_ALREADY_RUNNING',
          'A retention purge job is already holding the database advisory lock',
        );
      }
      return createSkippedLockedResult(input.trigger, input.dryRun, startedAt);
    }
    // Get the results
    const familyResults = lockResult.value;

    const completedAt = new Date();
    const totalDeletedNormalizedEvents = familyResults.reduce(
      (sum, item) => sum + item.deletedNormalizedEvents,
      0,
    );
    const totalDeletedInvalidEvents = familyResults.reduce(
      (sum, item) => sum + item.deletedInvalidEvents,
      0,
    );
    const totalProtectedEvents = familyResults.reduce(
      (sum, item) => sum + item.protectedByAlertOrIncident,
      0,
    );
    // Create the result
    const result: RetentionPurgeRunResultDto = {
      status: input.dryRun ? 'DRY_RUN' : 'COMPLETED',
      trigger: input.trigger,
      dryRun: input.dryRun,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      totalDeletedNormalizedEvents,
      totalDeletedInvalidEvents,
      totalProtectedEvents,
      families: familyResults,
    };
    // Save the result
    lastRunResult = result;
    // Record audit log if needed
    if (!input.dryRun && (input.trigger === 'MANUAL' || totalDeletedNormalizedEvents + totalDeletedInvalidEvents > 0)) {
      await auditWriter.record({
        actorType: input.actor.type === 'USER' ? 'USER' : 'SYSTEM',
        actorUserId: input.actor.type === 'USER' ? input.actor.userId : null,
        action: 'EVENT_RETENTION_PURGE_EXECUTED',
        resourceType: 'EVENT_DATA_GOVERNANCE_POLICY',
        resourceId: null,
        source: input.trigger === 'MANUAL' ? 'API' : 'WORKER',
        afterData: {
          trigger: input.trigger,
          totalDeletedNormalizedEvents,
          totalDeletedInvalidEvents,
          totalProtectedEvents,
          durationMs: result.durationMs,
          families: familyResults.map((item) => ({
            eventFamily: item.eventFamily,
            eligible: item.eligible,
            reason: item.reason,
            retentionDays: item.retentionDays,
            cutoffDate: item.cutoffDate,
            deletedNormalizedEvents: item.deletedNormalizedEvents,
            deletedInvalidEvents: item.deletedInvalidEvents,
            protectedByAlertOrIncident: item.protectedByAlertOrIncident,
            hasMore: item.hasMore,
          })),
        },
      });
    }
    // Log the result
    logger.info(
      {
        trigger: input.trigger,
        dryRun: input.dryRun,
        totalDeletedNormalizedEvents,
        totalDeletedInvalidEvents,
        totalProtectedEvents,
        durationMs: result.durationMs,
      },
      'Retention purge execution finished',
    );

    return result;
  } finally {
    inProcessRunning = false;
  }
}
// Export the service
export const eventRetentionPurgeService = {
  isRunning(): boolean {
    return inProcessRunning;
  },

  getLastRun(): RetentionPurgeRunResultDto | null {
    return lastRunResult;
  },

  resetRuntimeStateForTests(): void {
    inProcessRunning = false;
    lastRunResult = null;
  },
  // Get status
  async getStatus(userId: string, workerActive: boolean): Promise<RetentionPurgeStatusDto> {
    await requireGovernanceAdmin(userId);

    const [activePolicies, recentAuditLogs] = await Promise.all([
      eventRetentionPurgeRepository.findActiveGovernancePolicies(),
      eventRetentionPurgeRepository.findRecentPurgeAuditLogs(10),
    ]);
    // Return the status
    return {
      enabled: env.RETENTION_PURGE_ENABLED,
      workerActive,
      running: inProcessRunning,
      intervalMs: env.RETENTION_PURGE_INTERVAL_MS,
      batchSize: env.RETENTION_PURGE_BATCH_SIZE,
      maxBatchesPerRun: env.RETENTION_PURGE_MAX_BATCHES_PER_RUN,
      runOnStartup: env.RETENTION_PURGE_RUN_ON_STARTUP,
      effectivePolicies: resolveEffectiveRetentionPolicies(activePolicies),
      lastRun: lastRunResult,
      recentRuns: recentAuditLogs.map(mapHistoryItem),
    };
  },
  // Run manual
  async runManual(userId: string, body: RunRetentionPurgeBody): Promise<RetentionPurgeRunResultDto> {
    await requireGovernanceAdmin(userId);
    // Execute purge
    return executePurge({
      actor: { type: 'USER', userId },
      trigger: 'MANUAL',
      dryRun: body.dryRun,
      ...(body.eventFamily !== undefined ? { eventFamily: body.eventFamily } : {}),
      ...(body.batchSize !== undefined ? { batchSize: body.batchSize } : {}),
      ...(body.maxBatches !== undefined ? { maxBatches: body.maxBatches } : {}),
    });
  },
  // Run automated
  async runAutomated(): Promise<RetentionPurgeRunResultDto> {
    return executePurge({
      actor: { type: 'SYSTEM' },
      trigger: 'SCHEDULED',
      dryRun: false,
    });
  },
};

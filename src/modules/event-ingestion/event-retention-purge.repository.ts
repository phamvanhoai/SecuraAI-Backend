import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { EventFamily } from './dto/event-governance-policy.dto.js';

export const PURGE_ADVISORY_LOCK_KEY = 742910481;
export const PURGE_TRANSACTION_TIMEOUT_MS = 120_000;
export const PURGE_TRANSACTION_MAX_WAIT_MS = 5_000;

export type PurgeLockResult<T> = { acquired: false } | { acquired: true; value: T };

// Define type for active retention policies from event_data_governance_policies table
export type ActiveRetentionPolicyRecord = {
  id: string;
  name: string;
  event_family: EventFamily | null;
  retention_days: number;
  archive_after_days: number | null;
  deletion_enabled: boolean;
  status: 'ACTIVE' | 'INACTIVE';
};

// Define type for counts of deleted items in a batch for normalized_events table
export type NormalizedPurgeBatchCounts = {
  deletedEvents: number;
  deletedDetections: number;
  deletedFeatureContributions: number;
  deletedMappings: number;
  deletedDetectionJobs: number;
};

// Define type for purge audit log record from event_retention_audit_log table
export type PurgeAuditLogRecord = {
  id: string;
  occurred_at: Date;
  actor_type: string;
  actor_user_id: string | null;
  source: string | null;
  outcome: string;
  after_data: Prisma.JsonValue | null;
};

// Build where clause to find eligible normalized_events for deletion
function buildEligibleNormalizedEventsWhere(
  eventFamily: EventFamily,
  cutoffDate: Date,
): Prisma.normalized_eventsWhereInput {
  return {
    event_family: eventFamily,
    occurred_at: { lt: cutoffDate },
    incident_evidence: { none: {} }, // Fetch only events not linked to any incident_evidence
    anomaly_detections: {
      none: {
        anomaly_alerts: { isNot: null }, // Exclude events with anomaly_alerts
      },
    },
  };
}

// Build query to find protected events
function buildProtectedNormalizedEventsWhere(
  eventFamily: EventFamily,
  cutoffDate: Date,
): Prisma.normalized_eventsWhereInput {
  return {
    event_family: eventFamily,
    occurred_at: { lt: cutoffDate },
    OR: [
      { incident_evidence: { some: {} } },
      {
        anomaly_detections: {
          some: {
            anomaly_alerts: { isNot: null },
          },
        },
      },
    ],
  };
}

// Execute batch deletion of normalized_events and their related data
async function executePurgeNormalizedEventsBatch(
  tx: Prisma.TransactionClient,
  eventFamily: EventFamily,
  cutoffDate: Date,
  batchSize: number,
): Promise<NormalizedPurgeBatchCounts> {
  // Fetch events that are eligible for deletion (no incident_evidence and no anomaly_alerts)
  const candidates = await tx.normalized_events.findMany({
    where: buildEligibleNormalizedEventsWhere(eventFamily, cutoffDate),
    orderBy: [{ occurred_at: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { id: true },
  });

  if (candidates.length === 0) {
    return {
      deletedEvents: 0,
      deletedDetections: 0,
      deletedFeatureContributions: 0,
      deletedMappings: 0,
      deletedDetectionJobs: 0,
    };
  }

  const eventIds = candidates.map((row) => row.id);

  // Fetch anomaly_detections for these events that don't have anomaly_alerts
  const detections = await tx.anomaly_detections.findMany({
    where: {
      event_id: { in: eventIds },
      anomaly_alerts: { is: null },
    },
    select: { id: true },
  });

  let deletedFeatureContributions = 0;
  let deletedDetections = 0;
  // Delete anomaly_feature_contributions and anomaly_detections for these events
  if (detections.length > 0) {
    const detectionIds = detections.map((row) => row.id);
    const featureRes = await tx.anomaly_feature_contributions.deleteMany({
      where: { detection_id: { in: detectionIds } },
    });
    deletedFeatureContributions = featureRes.count;

    const detectionRes = await tx.anomaly_detections.deleteMany({
      where: { id: { in: detectionIds } },
    });
    deletedDetections = detectionRes.count;
  }
  // Fetch event_entity_mappings for these events
  const mappings = await tx.event_entity_mappings.findMany({
    where: { event_id: { in: eventIds } },
    select: { id: true },
  });

  let deletedMappings = 0;
  // Delete event_entity_mappings for these events
  if (mappings.length > 0) {
    const mappingIds = mappings.map((row) => row.id);

    // Break all incoming self-FK references (both within this batch and from
    // newer mappings outside this batch) before deleting the expired mappings.
    await tx.event_entity_mappings.updateMany({
      where: { supersedes_mapping_id: { in: mappingIds } },
      data: { supersedes_mapping_id: null },
    });
    // Delete event_entity_mappings for these events
    const mappingRes = await tx.event_entity_mappings.deleteMany({
      where: { id: { in: mappingIds } },
    });
    deletedMappings = mappingRes.count;
  }
  // Delete detection_jobs for these events
  const jobRes = await tx.detection_jobs.deleteMany({
    where: { event_id: { in: eventIds } },
  });
  // Delete normalized_events for these events
  const eventRes = await tx.normalized_events.deleteMany({
    where: { id: { in: eventIds } },
  });

  return {
    deletedEvents: eventRes.count,
    deletedDetections,
    deletedFeatureContributions,
    deletedMappings,
    deletedDetectionJobs: jobRes.count,
  };
}
// Execute batch deletion of invalid_events
async function executePurgeInvalidEventsBatch(
  tx: Prisma.TransactionClient,
  eventFamily: EventFamily | null,
  cutoffDate: Date,
  batchSize: number,
): Promise<number> {
  // Fetch invalid_events for deletion
  const candidates = await tx.invalid_events.findMany({
    where: {
      event_family: eventFamily,
      received_at: { lt: cutoffDate },
    },
    orderBy: [{ received_at: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: { id: true },
  });
  // If no candidates found, return 0
  if (candidates.length === 0) {
    return 0;
  }
  // Delete invalid_events for these events
  const deleted = await tx.invalid_events.deleteMany({
    where: { id: { in: candidates.map((row) => row.id) } },
  });
  // Return the number of deleted invalid_events
  return deleted.count;
}

/**
 * Persistence helpers for scheduled and manual event retention purging.
 * Uses PostgreSQL transaction-scoped advisory locks and strict FK-ordered batched deletes.
 */
export const eventRetentionPurgeRepository = {
  async withPurgeLock<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<PurgeLockResult<T>> {
    return prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
          SELECT pg_try_advisory_xact_lock(CAST(${PURGE_ADVISORY_LOCK_KEY} AS bigint)) AS locked
        `;
        if (!rows[0]?.locked) {
          return { acquired: false };
        }

        const value = await work(tx);
        return { acquired: true, value };
      },
      {
        maxWait: PURGE_TRANSACTION_MAX_WAIT_MS,
        timeout: PURGE_TRANSACTION_TIMEOUT_MS,
      },
    );
  },
  // Find active governance policies
  findActiveGovernancePolicies(tx?: Prisma.TransactionClient): Promise<ActiveRetentionPolicyRecord[]> {
    return (tx ?? prisma).event_data_governance_policies.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        event_family: true,
        retention_days: true,
        archive_after_days: true,
        deletion_enabled: true,
        status: true,
      },
    });
  },

  // Count eligible normalized_events for deletion
  countEligibleNormalizedEvents(
    eventFamily: EventFamily,
    cutoffDate: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return (tx ?? prisma).normalized_events.count({
      where: buildEligibleNormalizedEventsWhere(eventFamily, cutoffDate),
    });
  },
  // Count protected normalized_events for deletion
  countProtectedNormalizedEvents(
    eventFamily: EventFamily,
    cutoffDate: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return (tx ?? prisma).normalized_events.count({
      where: buildProtectedNormalizedEventsWhere(eventFamily, cutoffDate),
    });
  },
  // Count eligible invalid_events for deletion
  countEligibleInvalidEvents(
    eventFamily: EventFamily | null,
    cutoffDate: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return (tx ?? prisma).invalid_events.count({
      where: {
        event_family: eventFamily,
        received_at: { lt: cutoffDate },
      },
    });
  },
  // Purge normalized_events in batches
  async purgeNormalizedEventsBatch(
    eventFamily: EventFamily,
    cutoffDate: Date,
    batchSize: number,
    tx?: Prisma.TransactionClient,
  ): Promise<NormalizedPurgeBatchCounts> {
    if (tx) {
      return executePurgeNormalizedEventsBatch(tx, eventFamily, cutoffDate, batchSize);
    }

    return prisma.$transaction((innerTx) =>
      executePurgeNormalizedEventsBatch(innerTx, eventFamily, cutoffDate, batchSize),
    );
  },
  // Purge invalid_events in batches
  async purgeInvalidEventsBatch(
    eventFamily: EventFamily | null,
    cutoffDate: Date,
    batchSize: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (tx) {
      return executePurgeInvalidEventsBatch(tx, eventFamily, cutoffDate, batchSize);
    }

    return prisma.$transaction((innerTx) =>
      executePurgeInvalidEventsBatch(innerTx, eventFamily, cutoffDate, batchSize),
    );
  },
  // Find recent purge audit logs
  findRecentPurgeAuditLogs(limit = 10): Promise<PurgeAuditLogRecord[]> {
    return prisma.audit_logs.findMany({
      where: { action: 'EVENT_RETENTION_PURGE_EXECUTED' },
      orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        occurred_at: true,
        actor_type: true,
        actor_user_id: true,
        source: true,
        outcome: true,
        after_data: true,
      },
    });
  },
};

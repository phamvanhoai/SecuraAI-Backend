import { AppError } from '../../common/errors/app-error.js';
import {
  eventGovernanceRepository,
  type GovernancePolicyWithUsers,
} from './event-governance.repository.js';
import type {
  EventGovernanceLifecycleSummaryDto,
  EventGovernancePolicyDto,
  ListEventGovernancePoliciesQuery,
  PaginatedEventGovernancePoliciesDto,
  UpdateEventGovernancePolicyDto,
} from './dto/event-governance-policy.dto.js';

function mapGovernancePolicyItem(record: GovernancePolicyWithUsers): EventGovernancePolicyDto {
  return {
    id: record.id,
    name: record.name,
    purpose: record.purpose,
    eventFamily: record.event_family,
    retentionDays: record.retention_days,
    accessScope: record.access_scope,
    maskingRules: (record.masking_rules as Record<string, unknown> | null) ?? null,
    exportAllowed: record.export_allowed,
    archiveAfterDays: record.archive_after_days,
    deletionEnabled: record.deletion_enabled,
    status: record.status,
    createdBy: record.creator
      ? {
          id: record.creator.id,
          name: record.creator.full_name || record.creator.email,
          email: record.creator.email,
        }
      : null,
    updatedBy: record.updater
      ? {
          id: record.updater.id,
          name: record.updater.full_name || record.updater.email,
          email: record.updater.email,
        }
      : null,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

async function requireGovernanceViewer(userId: string) {
  const actor = await eventGovernanceRepository.findActorUser(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or inactive user session');
  }

  if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER') {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Event data governance policy access is restricted to Administrators and Security Officers',
    );
  }

  return actor;
}

async function requireGovernanceAdmin(userId: string) {
  const actor = await eventGovernanceRepository.findActorUser(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or inactive user session');
  }

  if (actor.role !== 'ADMIN') {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only System Administrators can configure or update event data governance policies',
    );
  }

  return actor;
}

export const eventGovernanceService = {
  async listPolicies(
    userId: string,
    query: ListEventGovernancePoliciesQuery,
  ): Promise<PaginatedEventGovernancePoliciesDto> {
    await requireGovernanceViewer(userId);

    const [records, totalItems] = await Promise.all([
      eventGovernanceRepository.findMany(query),
      eventGovernanceRepository.count(query),
    ]);

    const totalPages = Math.ceil(totalItems / query.limit) || 1;
    const items = records.map(mapGovernancePolicyItem);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
      },
    };
  },

  async getPolicyDetail(userId: string, id: string): Promise<EventGovernancePolicyDto> {
    await requireGovernanceViewer(userId);

    const record = await eventGovernanceRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Event data governance policy not found');
    }

    return mapGovernancePolicyItem(record);
  },

  async updatePolicy(
    userId: string,
    id: string,
    data: UpdateEventGovernancePolicyDto,
  ): Promise<EventGovernancePolicyDto> {
    await requireGovernanceAdmin(userId);

    const existing = await eventGovernanceRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Event data governance policy not found');
    }

    const effectiveRetentionDays = data.retentionDays ?? existing.retention_days;
    const effectiveArchiveAfterDays =
      data.archiveAfterDays !== undefined ? data.archiveAfterDays : existing.archive_after_days;

    if (
      effectiveArchiveAfterDays !== null &&
      effectiveArchiveAfterDays !== undefined &&
      effectiveArchiveAfterDays >= effectiveRetentionDays
    ) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        `Cold archival threshold (${effectiveArchiveAfterDays} days) must be strictly less than effective retention period (${effectiveRetentionDays} days)`,
      );
    }

    const updated = await eventGovernanceRepository.update(id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.purpose !== undefined ? { purpose: data.purpose } : {}),
      ...(data.eventFamily !== undefined ? { event_family: data.eventFamily } : {}),
      ...(data.retentionDays !== undefined ? { retention_days: data.retentionDays } : {}),
      ...(data.accessScope !== undefined ? { access_scope: data.accessScope } : {}),
      ...(data.maskingRules !== undefined
        ? { masking_rules: data.maskingRules as Record<string, unknown> }
        : {}),
      ...(data.exportAllowed !== undefined ? { export_allowed: data.exportAllowed } : {}),
      ...(data.archiveAfterDays !== undefined
        ? { archive_after_days: data.archiveAfterDays }
        : {}),
      ...(data.deletionEnabled !== undefined ? { deletion_enabled: data.deletionEnabled } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      updated_by: userId,
    });

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Event data governance policy not found after update');
    }

    return mapGovernancePolicyItem(updated);
  },

  async getLifecycleSummary(userId: string): Promise<EventGovernanceLifecycleSummaryDto> {
    await requireGovernanceViewer(userId);

    const [activePolicies, totalCount] = await Promise.all([
      eventGovernanceRepository.findAllActive(),
      eventGovernanceRepository.count(),
    ]);

    const totalPolicies = totalCount;
    const activeCount = activePolicies.length;
    const inactiveCount = Math.max(0, totalPolicies - activeCount);

    const retentionValues = activePolicies.map((p) => p.retention_days);
    const minRetentionDays = retentionValues.length > 0 ? Math.min(...retentionValues) : 0;
    const maxRetentionDays = retentionValues.length > 0 ? Math.max(...retentionValues) : 0;
    const avgRetentionDays =
      retentionValues.length > 0
        ? Math.round(retentionValues.reduce((a, b) => a + b, 0) / retentionValues.length)
        : 0;

    const policiesWithArchival = activePolicies.filter(
      (p) => p.archive_after_days !== null && p.archive_after_days > 0,
    ).length;

    const policiesWithAutomatedDeletion = activePolicies.filter(
      (p) => p.deletion_enabled === true,
    ).length;

    const exportAllowedCount = activePolicies.filter((p) => p.export_allowed === true).length;

    return {
      totalPolicies,
      activePolicies: activeCount,
      inactivePolicies: inactiveCount,
      minRetentionDays,
      maxRetentionDays,
      avgRetentionDays,
      policiesWithArchival,
      policiesWithAutomatedDeletion,
      exportAllowedCount,
    };
  },
};

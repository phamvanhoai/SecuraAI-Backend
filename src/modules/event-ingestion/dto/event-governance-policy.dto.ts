import { z } from 'zod';
import { eventFamilies } from './list-normalized-events.dto.js';

export type EventFamily = (typeof eventFamilies)[number];

export const governancePolicyStatuses = ['ACTIVE', 'INACTIVE'] as const;
export type GovernancePolicyStatus = (typeof governancePolicyStatuses)[number];

export const listEventGovernancePoliciesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  eventFamily: z.enum(eventFamilies).optional(),
  status: z.enum(governancePolicyStatuses).optional(),
  sortBy: z
    .enum(['name', 'retentionDays', 'archiveAfterDays', 'status', 'createdAt', 'updatedAt'])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListEventGovernancePoliciesQuery = z.infer<
  typeof listEventGovernancePoliciesQuerySchema
>;

export const getEventGovernancePolicyParamsSchema = z.object({
  id: z.string().uuid(),
});

export type GetEventGovernancePolicyParams = z.infer<
  typeof getEventGovernancePolicyParamsSchema
>;

export type UserSummaryDto = {
  id: string;
  name: string;
  email: string;
};

export type EventGovernancePolicyDto = {
  id: string;
  name: string;
  purpose: string;
  eventFamily: EventFamily | null;
  retentionDays: number;
  accessScope: string | null;
  maskingRules: Record<string, unknown> | null;
  exportAllowed: boolean;
  archiveAfterDays: number | null;
  deletionEnabled: boolean;
  status: GovernancePolicyStatus;
  createdBy: UserSummaryDto | null;
  updatedBy: UserSummaryDto | null;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedEventGovernancePoliciesDto = {
  items: EventGovernancePolicyDto[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
};

export type EventGovernanceLifecycleSummaryDto = {
  totalPolicies: number;
  activePolicies: number;
  inactivePolicies: number;
  minRetentionDays: number;
  maxRetentionDays: number;
  avgRetentionDays: number;
  policiesWithArchival: number;
  policiesWithAutomatedDeletion: number;
  exportAllowedCount: number;
};

export const updateEventGovernancePolicySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, 'Policy name must be at least 3 characters')
      .max(150, 'Policy name cannot exceed 150 characters')
      .optional(),
    purpose: z
      .string()
      .trim()
      .min(5, 'Purpose must be at least 5 characters')
      .max(500, 'Purpose cannot exceed 500 characters')
      .optional(),
    eventFamily: z.enum(eventFamilies).nullable().optional(),
    retentionDays: z
      .number()
      .int()
      .min(1, 'Retention period must be at least 1 day')
      .max(3650, 'Retention period cannot exceed 3650 days (10 years)')
      .optional(),
    archiveAfterDays: z
      .number()
      .int()
      .min(1, 'Archival threshold must be at least 1 day')
      .max(3650)
      .nullable()
      .optional(),
    accessScope: z.string().trim().max(100).nullable().optional(),
    maskingRules: z.record(z.string(), z.unknown()).nullable().optional(),
    exportAllowed: z.boolean().optional(),
    deletionEnabled: z.boolean().optional(),
    status: z.enum(governancePolicyStatuses).optional(),
  })
  .refine(
    (data) => {
      if (
        data.archiveAfterDays !== undefined &&
        data.archiveAfterDays !== null &&
        data.retentionDays !== undefined
      ) {
        return data.archiveAfterDays < data.retentionDays;
      }
      return true;
    },
    {
      message:
        'Cold archival threshold (archiveAfterDays) must be strictly less than retention period (retentionDays)',
      path: ['archiveAfterDays'],
    },
  );

export type UpdateEventGovernancePolicyDto = z.infer<
  typeof updateEventGovernancePolicySchema
>;

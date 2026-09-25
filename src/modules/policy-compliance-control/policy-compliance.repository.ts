import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListPolicyDraftsQuery } from './dto/list-policy-drafts.dto.js';

const ownedPolicyDraftSelect = {
  id: true,
  policy_id: true,
  version_number: true,
  content: true,
  change_summary: true,
  status: true,
  author_user_id: true,
  created_at: true,
  policies_policy_versions_policy_idTopolicies: {
    select: {
      policy_code: true,
      title: true,
      description: true,
      owner_user_id: true,
      status: true,
      created_at: true,
      updated_at: true,
    },
  },
} satisfies Prisma.policy_versionsSelect;

export type OwnedPolicyDraftRecord = Prisma.policy_versionsGetPayload<{
  select: typeof ownedPolicyDraftSelect;
}>;

export const policyComplianceRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  listOwnDrafts(userId: string, query: ListPolicyDraftsQuery) {
    const where: Prisma.policy_versionsWhereInput = {
      status: 'DRAFT',
      author_user_id: userId,
      policies_policy_versions_policy_idTopolicies: {
        owner_user_id: userId,
        status: 'DRAFT',
        ...(query.q
          ? {
              OR: [
                { policy_code: { contains: query.q, mode: 'insensitive' as const } },
                { title: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
    };

    return prisma.$transaction([
      prisma.policy_versions.count({ where }),
      prisma.policy_versions.findMany({
        where,
        select: ownedPolicyDraftSelect,
        orderBy: [
          {
            policies_policy_versions_policy_idTopolicies: {
              updated_at: query.sortOrder,
            },
          },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
  },
};

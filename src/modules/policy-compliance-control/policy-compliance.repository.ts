import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const draftForSubmissionSelect = {
  id: true,
  policy_id: true,
  version_number: true,
  status: true,
  author_user_id: true,
  created_at: true,
  policies_policy_versions_policy_idTopolicies: {
    select: {
      id: true,
      policy_code: true,
      title: true,
      owner_user_id: true,
      status: true,
      updated_at: true,
    },
  },
} satisfies Prisma.policy_versionsSelect;

export type PolicyDraftForSubmission = Prisma.policy_versionsGetPayload<{
  select: typeof draftForSubmissionSelect;
}>;

export const policyComplianceRepository = {
  findActor(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
  },

  findDraftForSubmission(policyId: string, versionId: string) {
    return prisma.policy_versions.findFirst({
      where: { id: versionId, policy_id: policyId },
      select: draftForSubmissionSelect,
    });
  },

  submitDraft(policyId: string, versionId: string, actorUserId: string) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.policy_versions.updateMany({
        where: {
          id: versionId,
          policy_id: policyId,
          status: 'DRAFT',
          OR: [
            { author_user_id: actorUserId },
            {
              policies_policy_versions_policy_idTopolicies: {
                owner_user_id: actorUserId,
              },
            },
          ],
        },
        data: { status: 'IN_REVIEW' },
      });
      if (updated.count !== 1) return null;

      await transaction.policies.update({
        where: { id: policyId },
        data: { updated_at: new Date() },
      });

      return transaction.policy_versions.findUniqueOrThrow({
        where: { id: versionId },
        select: draftForSubmissionSelect,
      });
    });
  },
};

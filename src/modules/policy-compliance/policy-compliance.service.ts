import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import type { CreatePolicyDraftInput } from './dto/create-policy-draft.dto.js';
import { mapPolicyDraft } from './policy-compliance.mapper.js';
import { policyComplianceRepository } from './policy-compliance.repository.js';

export const policyComplianceService = {
  async createPolicyDraft(input: CreatePolicyDraftInput, actorUserId: string) {
    const existingPolicy = await policyComplianceRepository.findPolicyByCode(input.policyCode);
    if (existingPolicy) {
      throw new AppError(409, 'POLICY_CODE_EXISTS', 'A policy with this code already exists');
    }

    try {
      const policy = await prisma.$transaction(async (transaction) => {
        const createdPolicy = await policyComplianceRepository.createPolicyDraft(transaction, {
          policyCode: input.policyCode,
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
          versionNumber: input.versionNumber,
          content: input.content,
          actorUserId,
        });
        const currentVersion = createdPolicy.policy_versions[0];
        if (!currentVersion) {
          throw new Error('Newly created policy draft has no policy version');
        }

        await policyComplianceRepository.createPolicyDraftAudit(transaction, {
          actorUserId,
          policyId: createdPolicy.policy_id,
          policyCode: createdPolicy.policy_code,
          title: createdPolicy.title,
          versionNumber: currentVersion.version_number,
        });
        return createdPolicy;
      });

      return mapPolicyDraft(policy);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'POLICY_CODE_EXISTS', 'A policy with this code already exists');
      }
      throw error;
    }
  },
} as const;

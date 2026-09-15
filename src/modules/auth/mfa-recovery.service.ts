import { AppError } from '../../common/errors/app-error.js';
import { hashToken } from '../../common/utils/tokens.js';
import { authEmailService } from './auth.email.service.js';
import { mfaRecoveryRepository } from './mfa-recovery.repository.js';
import type {
  CreateMfaRecoveryRequestBody,
  DecideMfaRecoveryRequestBody,
  ListMfaRecoveryRequestsQuery,
} from './dto/mfa-recovery.dto.js';

const mapRequest = (request: {
  approval_request_id: string;
  status: string;
  submitted_at: Date;
  completed_at?: Date | null;
}) => ({
  id: request.approval_request_id,
  status: request.status,
  submittedAt: request.submitted_at,
  ...(request.completed_at !== undefined ? { completedAt: request.completed_at } : {}),
});

export const mfaRecoveryService = {
  async create(input: CreateMfaRecoveryRequestBody) {
    const result = await mfaRecoveryRepository.createFromChallenge(hashToken(input.challengeToken));
    if (result.kind === 'invalid_challenge') {
      throw new AppError(401, 'INVALID_MFA_CHALLENGE', 'MFA challenge is invalid or expired');
    }
    if (result.kind === 'workflow_unavailable') {
      throw new AppError(503, 'MFA_RECOVERY_UNAVAILABLE', 'MFA recovery workflow is unavailable');
    }
    return mapRequest(result.request);
  },

  async list(query: ListMfaRecoveryRequestsQuery) {
    const result = await mfaRecoveryRepository.list(query);
    return {
      items: result.items.map((item) => ({
        ...mapRequest(item),
        user: item.users
          ? { id: item.users.user_id, email: item.users.email, fullName: item.users.full_name }
          : null,
        decision: item.approval_actions[0]
          ? {
              decision: item.approval_actions[0].decision,
              reason: item.approval_actions[0].comment,
              actedAt: item.approval_actions[0].acted_at,
              reviewer: item.approval_actions[0].users
                ? { id: item.approval_actions[0].users.user_id, fullName: item.approval_actions[0].users.full_name }
                : null,
            }
          : null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },

  async decide(
    requestId: string,
    reviewerUserId: string,
    decision: 'approved' | 'rejected',
    input: DecideMfaRecoveryRequestBody,
  ) {
    const result = await mfaRecoveryRepository.decide({
      requestId,
      reviewerUserId,
      decision,
      reason: input.reason,
    });
    if (result.kind === 'not_found') {
      throw new AppError(404, 'MFA_RECOVERY_REQUEST_NOT_FOUND', 'MFA recovery request was not found');
    }
    if (result.kind === 'already_decided') {
      throw new AppError(409, 'MFA_RECOVERY_ALREADY_DECIDED', 'MFA recovery request was already decided');
    }
    if (result.kind === 'self_review') {
      throw new AppError(403, 'MFA_RECOVERY_SELF_REVIEW_FORBIDDEN', 'You cannot review your own MFA recovery request');
    }
    if (result.kind === 'invalid_workflow') {
      throw new AppError(500, 'MFA_RECOVERY_WORKFLOW_INVALID', 'MFA recovery workflow is invalid');
    }
    await authEmailService.sendMfaRecoveryDecisionEmail({
      to: result.email,
      fullName: result.fullName,
      decision,
    });
    return { id: requestId, status: decision };
  },
} as const;

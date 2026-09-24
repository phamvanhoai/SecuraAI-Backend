import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const ENTITY_TYPE = 'mfa_recovery';

async function ensureWorkflow(database: Prisma.TransactionClient) {
  const existing = await database.workflow_definitions.findFirst({
    where: { entity_type: ENTITY_TYPE, is_active: true },
    select: {
      workflow_definition_id: true,
      workflow_steps: { where: { step_order: 1 }, select: { workflow_step_id: true }, take: 1 },
    },
  });
  if (existing?.workflow_steps[0]) {
    return {
      definitionId: existing.workflow_definition_id,
      stepId: existing.workflow_steps[0].workflow_step_id,
    };
  }
  const adminRole = await database.roles.findUnique({
    where: { code: 'ADMIN' },
    select: { role_id: true },
  });
  if (!adminRole) return null;
  const created = await database.workflow_definitions.create({
    data: {
      name: 'MFA Recovery Approval',
      entity_type: ENTITY_TYPE,
      description: 'Administrator identity verification before resetting MFA',
      workflow_steps: {
        create: {
          step_order: 1,
          name: 'Administrator identity verification',
          approver_role_id: adminRole.role_id,
          required_approvals: 1,
        },
      },
    },
    select: {
      workflow_definition_id: true,
      workflow_steps: { select: { workflow_step_id: true }, take: 1 },
    },
  });
  const step = created.workflow_steps[0];
  return step ? { definitionId: created.workflow_definition_id, stepId: step.workflow_step_id } : null;
}

export const mfaRecoveryRepository = {
  async createFromChallenge(tokenHash: string) {
    return prisma.$transaction(async (database) => {
      const method = await database.mfa_methods.findFirst({
        where: {
          login_challenge_token_hash: tokenHash,
          login_challenge_expires_at: { gt: new Date() },
          is_enabled: true,
          method_type: 'totp',
        },
        select: { mfa_method_id: true, user_id: true },
      });
      if (!method) return { kind: 'invalid_challenge' as const };
      await database.mfa_methods.update({
        where: { mfa_method_id: method.mfa_method_id },
        data: {
          login_challenge_token_hash: null,
          login_challenge_expires_at: null,
          login_challenge_ip: null,
          updated_at: new Date(),
        },
      });
      const existing = await database.approval_requests.findFirst({
        where: { entity_type: ENTITY_TYPE, entity_id: method.user_id, status: 'pending' },
        select: { approval_request_id: true, status: true, submitted_at: true },
      });
      if (existing) return { kind: 'existing' as const, request: existing };
      const workflow = await ensureWorkflow(database);
      if (!workflow) return { kind: 'workflow_unavailable' as const };
      const request = await database.approval_requests.create({
        data: {
          workflow_definition_id: workflow.definitionId,
          entity_type: ENTITY_TYPE,
          entity_id: method.user_id,
          requested_by_user_id: method.user_id,
        },
        select: { approval_request_id: true, status: true, submitted_at: true },
      });
      return { kind: 'created' as const, request };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  async list(query: { page: number; limit: number; status?: string | undefined }) {
    const where = { entity_type: ENTITY_TYPE, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.approval_requests.findMany({
        where,
        select: {
          approval_request_id: true,
          status: true,
          submitted_at: true,
          completed_at: true,
          users: { select: { user_id: true, email: true, full_name: true } },
          approval_actions: {
            orderBy: { acted_at: 'desc' },
            take: 1,
            select: { decision: true, comment: true, acted_at: true, users: { select: { user_id: true, full_name: true } } },
          },
        },
        orderBy: { submitted_at: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.approval_requests.count({ where }),
    ]);
    return { items, total };
  },

  async decide(input: { requestId: string; reviewerUserId: string; decision: 'approved' | 'rejected'; reason: string }) {
    return prisma.$transaction(async (database) => {
      const request = await database.approval_requests.findFirst({
        where: { approval_request_id: input.requestId, entity_type: ENTITY_TYPE },
        select: {
          approval_request_id: true,
          entity_id: true,
          status: true,
          workflow_definitions: { select: { workflow_steps: { where: { step_order: 1 }, select: { workflow_step_id: true }, take: 1 } } },
          users: { select: { email: true, full_name: true } },
        },
      });
      if (!request) return { kind: 'not_found' as const };
      if (request.status !== 'pending') return { kind: 'already_decided' as const };
      if (request.entity_id === input.reviewerUserId) return { kind: 'self_review' as const };
      const step = request.workflow_definitions.workflow_steps[0];
      if (!step || !request.users) return { kind: 'invalid_workflow' as const };
      const updated = await database.approval_requests.updateMany({
        where: { approval_request_id: input.requestId, status: 'pending' },
        data: { status: input.decision, completed_at: new Date() },
      });
      if (updated.count !== 1) return { kind: 'already_decided' as const };
      await database.approval_actions.create({
        data: {
          approval_request_id: input.requestId,
          workflow_step_id: step.workflow_step_id,
          acted_by_user_id: input.reviewerUserId,
          decision: input.decision,
          comment: input.reason,
        },
      });
      if (input.decision === 'approved') {
        await database.mfa_methods.updateMany({
          where: { user_id: request.entity_id, method_type: 'totp' },
          data: {
            secret_encrypted: null,
            is_enabled: false,
            verified_at: null,
            last_used_totp_step: null,
            recovery_code_hashes: Prisma.DbNull,
            login_challenge_token_hash: null,
            login_challenge_expires_at: null,
            login_challenge_attempts: 0,
            login_challenge_ip: null,
            updated_at: new Date(),
          },
        });
        await database.auth_sessions.updateMany({
          where: { user_id: request.entity_id, revoked_at: null },
          data: { revoked_at: new Date() },
        });
      }
      await database.audit_logs.create({
        data: {
          actor_user_id: input.reviewerUserId,
          module: 'auth',
          action: `mfa.recovery.${input.decision}`,
          entity_type: ENTITY_TYPE,
          entity_id: input.requestId,
          after_data: { userId: request.entity_id, decision: input.decision, reason: input.reason },
        },
      });
      return { kind: 'decided' as const, email: request.users.email, fullName: request.users.full_name };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
} as const;

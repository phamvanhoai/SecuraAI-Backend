import { AppError } from '../../common/errors/app-error.js';
import type { ListRiskAssessmentsQuery } from './dto/list-risk-assessments-query.dto.js';
import { toRiskAssessmentListItem } from './risk-management.mapper.js';
import { toRiskAssessmentDetail } from './risk-management.mapper.js';
import type { CreateRiskAssessmentBody } from './dto/create-risk-assessment.dto.js';
import { randomUUID } from 'node:crypto';
import { riskManagementRepository } from './risk-management.repository.js';
import type { UpdateRiskAssessmentBody } from './dto/update-risk-assessment.dto.js';
import type { CancelRiskAssessmentBody } from './dto/cancel-risk-assessment.dto.js';
import { Prisma } from '@prisma/client';
import type { RiskCreateOptionsQuery } from './dto/risk-create-options-query.dto.js';

const isRiskCodeConflict = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false;
  const target = error.meta?.['target'];
  if (typeof target === 'string') return target.includes('risk_code');
  return Array.isArray(target) && target.some((column) => column === 'risk_code');
};

export const riskManagementService = {
  async cancel(
    riskAssessmentId: string,
    input: CancelRiskAssessmentBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risks.cancel'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const current = await riskManagementRepository.findById(riskAssessmentId);
    if (!current)
      throw new AppError(404, 'RISK_ASSESSMENT_NOT_FOUND', 'Risk assessment was not found');
    if (current.assessed_by_user_id !== actor.userId && !actor.roles.includes('ADMIN'))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the assessor or an administrator can cancel this risk assessment',
      );
    if (!['draft', 'rejected'].includes(current.status))
      throw new AppError(
        422,
        'RISK_NOT_CANCELLABLE',
        'Only draft or rejected risk assessments can be cancelled',
      );
    if (current.risk_treatment_plans.length > 0)
      throw new AppError(
        409,
        'RISK_HAS_TREATMENT_PLAN',
        'A risk assessment with a treatment plan cannot be cancelled',
      );
    const result = await riskManagementRepository.cancel(riskAssessmentId, input, current, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.failure === 'ACTOR_INACTIVE')
      throw new AppError(403, 'ACTOR_INACTIVE', 'The current user cannot cancel assessments');
    if (result.failure === 'RISK_NOT_CANCELLABLE')
      throw new AppError(
        422,
        'RISK_NOT_CANCELLABLE',
        'Only draft or rejected risk assessments can be cancelled',
      );
    if (result.failure === 'RISK_HAS_TREATMENT_PLAN')
      throw new AppError(
        409,
        'RISK_HAS_TREATMENT_PLAN',
        'A risk assessment with a treatment plan cannot be cancelled',
      );
    if (result.failure === 'RISK_LINKED_TO_INCIDENT')
      throw new AppError(
        409,
        'RISK_LINKED_TO_INCIDENT',
        'A risk assessment linked to an incident cannot be cancelled',
      );
    if (result.failure === 'RISK_HAS_SUCCESSOR')
      throw new AppError(
        409,
        'RISK_HAS_SUCCESSOR',
        'A risk assessment referenced by a later assessment cannot be cancelled',
      );
    if (result.failure === 'RISK_ASSESSMENT_CHANGED' || !result.cancelled)
      throw new AppError(
        409,
        'RISK_ASSESSMENT_CHANGED',
        'This risk assessment was modified by another user. Reload it before cancelling',
      );
    return toRiskAssessmentDetail(result.cancelled);
  },
  async listCreateOptions(
    query: RiskCreateOptionsQuery,
    actor: { permissions: readonly string[] },
  ) {
    if (!actor.permissions.includes('risks.create') && !actor.permissions.includes('risks.update'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const options = await riskManagementRepository.listCreateOptions(query);
    const pagination = {
      page: query.page,
      limit: query.limit,
      total: options.total,
      totalPages: Math.ceil(options.total / query.limit),
    };
    if (options.type === 'assets')
      return {
        type: options.type,
        items: options.items.map((item) => ({
          id: item.asset_id,
          code: item.asset_code,
          name: item.name,
        })),
        pagination,
      };
    if (options.type === 'businessProcesses')
      return {
        type: options.type,
        items: options.items.map((item) => ({
          id: item.business_process_id,
          code: item.code,
          name: item.name,
        })),
        pagination,
      };
    if (options.type === 'threats')
      return {
        type: options.type,
        items: options.items.map((item) => ({
          id: item.threat_id,
          code: item.code,
          name: item.name,
        })),
        pagination,
      };
    return {
      type: options.type,
      items: options.items.map((item) => ({
        id: item.vulnerability_id,
        code: item.code,
        name: item.name,
        severity: item.severity,
      })),
      pagination,
    };
  },
  async create(
    input: CreateRiskAssessmentBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risks.create'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    if (!(await riskManagementRepository.findActiveAssessor(actor.userId)))
      throw new AppError(
        403,
        'ASSESSOR_INACTIVE',
        'The current user cannot be assigned as assessor',
      );
    if (input.assetId) {
      const asset = await riskManagementRepository.findAssetTarget(input.assetId);
      if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The selected asset was not found');
      if (asset.deleted_at || asset.status === 'disposed')
        throw new AppError(
          422,
          'ASSET_NOT_ASSESSABLE',
          'Deleted or disposed assets cannot be assessed',
        );
    } else if (input.businessProcessId) {
      const process = await riskManagementRepository.findBusinessProcessTarget(
        input.businessProcessId,
      );
      if (!process)
        throw new AppError(
          404,
          'BUSINESS_PROCESS_NOT_FOUND',
          'The selected business process was not found',
        );
      if (process.status !== 'active')
        throw new AppError(
          422,
          'BUSINESS_PROCESS_INACTIVE',
          'The selected business process is not active',
        );
    }
    const [threatCount, vulnerabilityCount] = await Promise.all([
      riskManagementRepository.countThreats(input.threats.map(({ threatId }) => threatId)),
      riskManagementRepository.countVulnerabilities(
        input.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId),
      ),
    ]);
    if (threatCount !== input.threats.length)
      throw new AppError(422, 'THREAT_NOT_FOUND', 'One or more selected threats do not exist');
    if (vulnerabilityCount !== input.vulnerabilities.length)
      throw new AppError(
        422,
        'VULNERABILITY_NOT_FOUND',
        'One or more selected vulnerabilities do not exist',
      );
    const score = input.likelihood * input.impact;
    const level = score <= 4 ? 'low' : score <= 9 ? 'medium' : score <= 16 ? 'high' : 'critical';
    let result: Awaited<ReturnType<typeof riskManagementRepository.create>> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const riskCode = `RSK-${new Date().getUTCFullYear()}-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      try {
        result = await riskManagementRepository.create(
          input,
          { riskCode, score, level },
          { actorUserId: actor.userId, ...context },
        );
        break;
      } catch (error: unknown) {
        if (!isRiskCodeConflict(error) || attempt === 2) throw error;
      }
    }
    if (!result)
      throw new AppError(
        500,
        'RISK_CODE_GENERATION_FAILED',
        'Unable to generate a unique risk code',
      );
    if (result.failure === 'ASSESSOR_INACTIVE')
      throw new AppError(
        403,
        'ASSESSOR_INACTIVE',
        'The current user cannot be assigned as assessor',
      );
    if (result.failure === 'ASSET_NOT_ASSESSABLE')
      throw new AppError(422, 'ASSET_NOT_ASSESSABLE', 'The selected asset is no longer assessable');
    if (result.failure === 'BUSINESS_PROCESS_INACTIVE')
      throw new AppError(
        422,
        'BUSINESS_PROCESS_INACTIVE',
        'The selected business process is no longer active',
      );
    if (result.duplicate)
      throw new AppError(
        409,
        'POTENTIAL_DUPLICATE_RISK',
        `An open risk with this title already exists (${result.duplicate.risk_code})`,
      );
    const risk = result.risk;
    return {
      id: risk.risk_assessment_id,
      riskCode: risk.risk_code,
      title: risk.title,
      status: risk.status,
      riskScore: risk.risk_score,
      riskLevel: risk.risk_level,
      assessedAt: risk.assessed_at,
    };
  },
  async list(query: ListRiskAssessmentsQuery, actor: { permissions: readonly string[] }) {
    if (!actor.permissions.includes('risks.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await riskManagementRepository.list(query);
    return {
      items: result.items.map(toRiskAssessmentListItem),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async getById(riskAssessmentId: string, actor: { permissions: readonly string[] }) {
    if (!actor.permissions.includes('risks.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const risk = await riskManagementRepository.findById(riskAssessmentId);
    if (!risk)
      throw new AppError(404, 'RISK_ASSESSMENT_NOT_FOUND', 'Risk assessment was not found');
    return toRiskAssessmentDetail(risk);
  },
  async update(
    riskAssessmentId: string,
    input: UpdateRiskAssessmentBody,
    actor: { userId: string; permissions: readonly string[]; roles: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('risks.update'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const current = await riskManagementRepository.findById(riskAssessmentId);
    if (!current)
      throw new AppError(404, 'RISK_ASSESSMENT_NOT_FOUND', 'Risk assessment was not found');
    if (current.assessed_by_user_id !== actor.userId && !actor.roles.includes('ADMIN'))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only the assessor or an administrator can edit this risk assessment',
      );
    if (!(await riskManagementRepository.findActiveAssessor(actor.userId)))
      throw new AppError(403, 'ASSESSOR_INACTIVE', 'The current user cannot edit risk assessments');
    if (!['draft', 'rejected'].includes(current.status))
      throw new AppError(
        422,
        'RISK_NOT_EDITABLE',
        'Only draft or rejected risk assessments can be edited',
      );
    if (input.assetId) {
      const asset = await riskManagementRepository.findAssetTarget(input.assetId);
      if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'The selected asset was not found');
      if (asset.deleted_at || asset.status === 'disposed')
        throw new AppError(
          422,
          'ASSET_NOT_ASSESSABLE',
          'Deleted or disposed assets cannot be assessed',
        );
    } else if (input.businessProcessId) {
      const process = await riskManagementRepository.findBusinessProcessTarget(
        input.businessProcessId,
      );
      if (!process)
        throw new AppError(
          404,
          'BUSINESS_PROCESS_NOT_FOUND',
          'The selected business process was not found',
        );
      if (process.status !== 'active')
        throw new AppError(
          422,
          'BUSINESS_PROCESS_INACTIVE',
          'The selected business process is not active',
        );
    }
    const [threatCount, vulnerabilityCount, duplicate] = await Promise.all([
      riskManagementRepository.countThreats(input.threats.map(({ threatId }) => threatId)),
      riskManagementRepository.countVulnerabilities(
        input.vulnerabilities.map(({ vulnerabilityId }) => vulnerabilityId),
      ),
      riskManagementRepository.findPotentialDuplicateForUpdate(riskAssessmentId, input),
    ]);
    if (threatCount !== input.threats.length)
      throw new AppError(422, 'THREAT_NOT_FOUND', 'One or more selected threats do not exist');
    if (vulnerabilityCount !== input.vulnerabilities.length)
      throw new AppError(
        422,
        'VULNERABILITY_NOT_FOUND',
        'One or more selected vulnerabilities do not exist',
      );
    if (duplicate)
      throw new AppError(
        409,
        'POTENTIAL_DUPLICATE_RISK',
        `An open risk with this title already exists (${duplicate.risk_code})`,
      );
    const score = input.likelihood * input.impact;
    const level = score <= 4 ? 'low' : score <= 9 ? 'medium' : score <= 16 ? 'high' : 'critical';
    const result = await riskManagementRepository.update(
      riskAssessmentId,
      input,
      { score, level },
      current,
      { actorUserId: actor.userId, ...context },
    );
    if (result.duplicate)
      throw new AppError(
        409,
        'POTENTIAL_DUPLICATE_RISK',
        `An open risk with this title already exists (${result.duplicate.risk_code})`,
      );
    if (result.failure === 'TARGET_LOCKED')
      throw new AppError(
        422,
        'RISK_TARGET_LOCKED',
        'The target of a rejected assessment cannot be changed',
      );
    if (result.failure === 'ASSESSOR_INACTIVE')
      throw new AppError(403, 'ASSESSOR_INACTIVE', 'The current user cannot edit risk assessments');
    if (result.failure === 'TARGET_INVALID')
      throw new AppError(
        422,
        'TARGET_NOT_ASSESSABLE',
        'The selected target is no longer assessable',
      );
    if (result.failure === 'THREAT_NOT_FOUND')
      throw new AppError(422, 'THREAT_NOT_FOUND', 'One or more selected threats do not exist');
    if (result.failure === 'VULNERABILITY_NOT_FOUND')
      throw new AppError(
        422,
        'VULNERABILITY_NOT_FOUND',
        'One or more selected vulnerabilities do not exist',
      );
    if (result.failure === 'RISK_HAS_TREATMENT_PLAN')
      throw new AppError(
        409,
        'RISK_HAS_TREATMENT_PLAN',
        'An assessment with a treatment plan cannot be edited',
      );
    if (result.failure === 'RISK_LINKED_TO_INCIDENT')
      throw new AppError(
        409,
        'RISK_LINKED_TO_INCIDENT',
        'An assessment linked to an incident cannot be edited',
      );
    if (result.failure === 'RISK_ASSESSMENT_CHANGED' || !result.updated)
      throw new AppError(
        409,
        'RISK_ASSESSMENT_CHANGED',
        'This risk assessment was modified by another user. Reload it before saving',
      );
    return toRiskAssessmentDetail(result.updated);
  },
} as const;

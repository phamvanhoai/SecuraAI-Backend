import { AppError } from '../../common/errors/app-error.js';
import type { CreateControlAssessmentInput, ListControlAssessmentsQuery } from './dto/control-assessment.dto.js';
import { controlAssessmentRepository } from './control-assessment.repository.js';

type Actor = { userId: string; permissions: readonly string[] };
type Context = { ipAddress: string | null; userAgent: string | null };
const requirePermission = (actor: Actor) => {
  if (!actor.permissions.includes('compliance.assess-controls')) throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
};
const mapAssessment = (item: Awaited<ReturnType<typeof controlAssessmentRepository.listHistory>>[number]) => ({
  id: item.control_assessment_id,
  complianceStatus: item.compliance_status,
  score: item.score === null ? null : Number(item.score),
  notes: item.notes,
  assessedAt: item.assessed_at.toISOString(),
  nextReviewAt: item.next_review_at?.toISOString() ?? null,
  assessor: item.users ? { id: item.users.user_id, name: item.users.full_name, email: item.users.email } : null,
  evidenceCount: item._count.compliance_evidence,
});

export const controlAssessmentService = {
  async list(query: ListControlAssessmentsQuery, actor: Actor) {
    requirePermission(actor);
    const result = await controlAssessmentRepository.list(query);
    return {
      items: result.items.map((item) => ({
        id: item.compliance_control_id,
        controlCode: item.control_code,
        title: item.title,
        description: item.description,
        framework: { id: item.compliance_frameworks.compliance_framework_id, code: item.compliance_frameworks.code, name: item.compliance_frameworks.name, version: item.compliance_frameworks.version },
        latestAssessment: item.control_assessments[0] ? mapAssessment(item.control_assessments[0]) : null,
        mappedPolicies: item.policy_control_mappings.map(({ policy_versions: version }) => ({ id: version.policies.policy_id, policyCode: version.policies.policy_code, title: version.policies.title, versionId: version.policy_version_id, versionNumber: version.version_number, versionStatus: version.status })),
        mappedPolicyCount: item._count.policy_control_mappings,
      })),
      frameworks: result.frameworks.map((item) => ({ id: item.compliance_framework_id, code: item.code, name: item.name, version: item.version })),
      summary: result.summary,
      pagination: { page: query.page, limit: query.limit, total: result.total, totalPages: Math.ceil(result.total / query.limit) },
      resultsTruncated: result.truncated,
    };
  },
  async history(controlId: string, actor: Actor) {
    requirePermission(actor);
    const control = await controlAssessmentRepository.findControl(controlId);
    if (!control) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Compliance control was not found');
    return { control: { id: control.compliance_control_id, controlCode: control.control_code, title: control.title }, items: (await controlAssessmentRepository.listHistory(controlId)).map(mapAssessment) };
  },
  async create(controlId: string, input: CreateControlAssessmentInput, actor: Actor, context: Context) {
    requirePermission(actor);
    const control = await controlAssessmentRepository.findControl(controlId);
    if (!control) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Compliance control was not found');
    if (input.nextReviewAt && new Date(input.nextReviewAt) < new Date()) throw new AppError(422, 'INVALID_NEXT_REVIEW_AT', 'Next review date cannot be in the past');
    return mapAssessment(await controlAssessmentRepository.create(controlId, input, actor.userId, context));
  },
};

import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListEvidenceAssessmentsQuery, UploadEvidenceInput } from './dto/compliance-evidence.dto.js';

const evidenceSelect = { compliance_evidence_id: true, description: true, valid_until: true, created_at: true, users: { select: { user_id: true, full_name: true } }, files: { select: { file_id: true, original_name: true, storage_key: true, mime_type: true, size_bytes: true, checksum: true } } } satisfies Prisma.compliance_evidenceSelect;
const scopeWhere = (departmentId: string | null, unrestricted: boolean): Prisma.control_assessmentsWhereInput => unrestricted ? {} : { compliance_controls: { policy_control_mappings: { some: { policy_versions: { policies: { policy_departments: { some: { department_id: departmentId ?? '__none__' } } } } } } } };

export const complianceEvidenceRepository = {
  getActor(userId: string) { return prisma.users.findUnique({ where: { user_id: userId }, select: { department_id: true } }); },
  async listAssessments(query: ListEvidenceAssessmentsQuery, departmentId: string | null, unrestricted: boolean) {
    const where: Prisma.control_assessmentsWhereInput = { ...scopeWhere(departmentId, unrestricted), ...(query.q ? { OR: [{ compliance_controls: { control_code: { contains: query.q, mode: 'insensitive' } } }, { compliance_controls: { title: { contains: query.q, mode: 'insensitive' } } }] } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.control_assessments.findMany({ where, skip: (query.page - 1) * query.limit, take: query.limit, orderBy: { assessed_at: 'desc' }, select: { control_assessment_id: true, compliance_status: true, score: true, assessed_at: true, compliance_controls: { select: { control_code: true, title: true, compliance_frameworks: { select: { code: true, version: true } } } }, compliance_evidence: { orderBy: { created_at: 'desc' }, select: evidenceSelect } } }),
      prisma.control_assessments.count({ where }),
    ]);
    return { items, total };
  },
  findAccessibleAssessment(assessmentId: string, departmentId: string | null, unrestricted: boolean) { return prisma.control_assessments.findFirst({ where: { control_assessment_id: assessmentId, ...scopeWhere(departmentId, unrestricted) }, select: { control_assessment_id: true, compliance_control_id: true } }); },
  findAccessibleEvidence(evidenceId: string, departmentId: string | null, unrestricted: boolean) { return prisma.compliance_evidence.findFirst({ where: { compliance_evidence_id: evidenceId, control_assessments: scopeWhere(departmentId, unrestricted) }, select: evidenceSelect }); },
  create(input: UploadEvidenceInput & { assessmentId: string; actorUserId: string; originalName: string; storageKey: string; mimeType: string; sizeBytes: number; checksum: string; ipAddress: string | null; userAgent: string | null }) {
    return prisma.$transaction(async (database) => {
      const file = await database.files.create({ data: { original_name: input.originalName, storage_key: input.storageKey, mime_type: input.mimeType, size_bytes: BigInt(input.sizeBytes), checksum: input.checksum, uploaded_by_user_id: input.actorUserId }, select: { file_id: true } });
      const evidence = await database.compliance_evidence.create({ data: { control_assessment_id: input.assessmentId, file_id: file.file_id, description: input.description, valid_until: input.validUntil ? new Date(`${input.validUntil}T00:00:00.000Z`) : null, uploaded_by_user_id: input.actorUserId }, select: evidenceSelect });
      await database.audit_logs.create({ data: { actor_user_id: input.actorUserId, module: 'policy-compliance', action: 'compliance.evidence.uploaded', entity_type: 'compliance_evidence', entity_id: evidence.compliance_evidence_id, after_data: { assessmentId: input.assessmentId, fileId: file.file_id, mimeType: input.mimeType, sizeBytes: input.sizeBytes, validUntil: input.validUntil }, ip_address: input.ipAddress, user_agent: input.userAgent } });
      return evidence;
    });
  },
};

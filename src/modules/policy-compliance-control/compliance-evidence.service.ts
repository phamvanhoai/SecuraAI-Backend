import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { complianceEvidenceRepository } from './compliance-evidence.repository.js';
import type { ListEvidenceAssessmentsQuery, UploadEvidenceInput } from './dto/compliance-evidence.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
const permission = 'compliance.evidence.upload';
const requirePermission = (actor: Actor) => { if (!actor.permissions.includes(permission)) throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions'); };
const mapEvidence = (item: NonNullable<Awaited<ReturnType<typeof complianceEvidenceRepository.findAccessibleEvidence>>>) => ({ id: item.compliance_evidence_id, description: item.description, validUntil: item.valid_until?.toISOString().slice(0, 10) ?? null, createdAt: item.created_at.toISOString(), uploadedBy: item.users ? { id: item.users.user_id, name: item.users.full_name } : null, file: { id: item.files.file_id, name: item.files.original_name, mimeType: item.files.mime_type, sizeBytes: item.files.size_bytes === null ? null : Number(item.files.size_bytes), checksum: item.files.checksum } });
const access = async (actor: Actor) => { requirePermission(actor); const user = await complianceEvidenceRepository.getActor(actor.userId); if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User was not found'); return { departmentId: user.department_id, unrestricted: actor.permissions.includes('compliance.assess-controls') }; };
const safePath = (storageKey: string) => { const root = path.resolve(env.FILE_STORAGE_DIR); const absolute = path.resolve(root, ...storageKey.split('/')); if (!absolute.startsWith(`${root}${path.sep}`)) throw new AppError(500, 'FILE_STORAGE_ERROR', 'Could not resolve evidence file'); return absolute; };

export const complianceEvidenceService = {
  async list(query: ListEvidenceAssessmentsQuery, actor: Actor) { const scope = await access(actor); const result = await complianceEvidenceRepository.listAssessments(query, scope.departmentId, scope.unrestricted); return { items: result.items.map((item) => ({ id: item.control_assessment_id, complianceStatus: item.compliance_status, score: item.score === null ? null : Number(item.score), assessedAt: item.assessed_at.toISOString(), control: { code: item.compliance_controls.control_code, title: item.compliance_controls.title, framework: item.compliance_controls.compliance_frameworks }, evidence: item.compliance_evidence.map(mapEvidence) })), pagination: { page: query.page, limit: query.limit, total: result.total, totalPages: Math.ceil(result.total / query.limit) } }; },
  async upload(assessmentId: string, input: UploadEvidenceInput, file: { originalName: string; mimeType: string; buffer: Buffer }, actor: Actor, context: { ipAddress: string | null; userAgent: string | null }) {
    const scope = await access(actor); const assessment = await complianceEvidenceRepository.findAccessibleAssessment(assessmentId, scope.departmentId, scope.unrestricted); if (!assessment) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'An accessible control assessment was not found');
    const storageKey = path.posix.join('compliance-evidence', `${randomUUID()}`); const absolute = safePath(storageKey); await mkdir(path.dirname(absolute), { recursive: true }); await writeFile(absolute, file.buffer, { flag: 'wx' });
    try { return mapEvidence(await complianceEvidenceRepository.create({ ...input, assessmentId, actorUserId: actor.userId, originalName: file.originalName, storageKey, mimeType: file.mimeType, sizeBytes: file.buffer.byteLength, checksum: createHash('sha256').update(file.buffer).digest('hex'), ...context })); } catch (error: unknown) { await rm(absolute, { force: true }); throw error; }
  },
  async download(evidenceId: string, actor: Actor) { const scope = await access(actor); const evidence = await complianceEvidenceRepository.findAccessibleEvidence(evidenceId, scope.departmentId, scope.unrestricted); if (!evidence) throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Compliance evidence was not found'); return { absolutePath: safePath(evidence.files.storage_key), name: evidence.files.original_name, mimeType: evidence.files.mime_type ?? 'application/octet-stream' }; },
};

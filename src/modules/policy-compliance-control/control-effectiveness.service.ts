import { AppError } from '../../common/errors/app-error.js';
import { isControlEvidenceUsable } from './control-evidence.rules.js';
import type {
  AssessControlEffectivenessBody,
  ListControlEffectivenessQuery,
} from './dto/assess-control-effectiveness.dto.js';
import {
  controlEffectivenessRepository,
  type ControlEffectivenessRecord,
} from './control-effectiveness.repository.js';

const map = (item: ControlEffectivenessRecord) => ({
  id: item.id,
  controlCode: item.control_code,
  name: item.name,
  description: item.description,
  applicability: item.applicability.toLowerCase(),
  implementationStatus: item.implementation_status.toLowerCase(),
  owner: item.users_security_controls_owner_user_idTousers
    ? {
        id: item.users_security_controls_owner_user_idTousers.id,
        fullName: item.users_security_controls_owner_user_idTousers.full_name,
      }
    : null,
  evidence: item.control_evidence_links
    .filter((link) => isControlEvidenceUsable(link.evidence_items, new Date()))
    .map(({ evidence_items }) => ({
      id: evidence_items.id,
      name: evidence_items.name,
      source: evidence_items.source,
      collectedAt: evidence_items.collected_at,
      reviewedAt: evidence_items.reviewed_at,
    })),
  assessments: item.control_assessments.map((value) => ({
    id: value.id,
    testMethod: value.test_method,
    result: value.result?.toLowerCase() ?? null,
    effectiveness: value.effectiveness?.toNumber() ?? null,
    notes: value.notes,
    assessedAt: value.assessed_at,
    assessor: { id: value.users.id, fullName: value.users.full_name },
  })),
  canManageEvidence: true,
});
async function actor(id: string) {
  const found = await controlEffectivenessRepository.findActor(id);
  if (!found || found.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return found;
}
export const controlEffectivenessService = {
  async list(userId: string, query: ListControlEffectivenessQuery) {
    const user = await actor(userId);
    if (!['SECURITY_OFFICER', 'EMPLOYEE'].includes(user.role))
      throw new AppError(
        403,
        'FORBIDDEN',
        'Security Officer or assigned Employee Control Owner required',
      );
    const [total, items] = await controlEffectivenessRepository.list(
      userId,
      user.role === 'SECURITY_OFFICER',
      query,
    );
    return {
      items: items.map(map),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },
  async assess(userId: string, controlId: string, input: AssessControlEffectivenessBody) {
    const user = await actor(userId);
    const control = await controlEffectivenessRepository.find(controlId);
    if (!control) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Security control not found');
    if (user.role !== 'SECURITY_OFFICER' && control.owner_user_id !== userId)
      throw new AppError(403, 'FORBIDDEN', 'Security Officer or assigned Control Owner required');
    if (
      !control.control_evidence_links.some((link) =>
        isControlEvidenceUsable(link.evidence_items, new Date()),
      )
    )
      throw new AppError(
        422,
        'CONTROL_EVIDENCE_REQUIRED',
        'At least one active evidence item is required',
      );
    const created = await controlEffectivenessRepository.create(controlId, userId, input, control);
    return {
      assessmentId: created.id,
      controlId,
      controlCode: control.control_code,
      result: input.result,
      effectiveness: input.effectiveness,
      assessedAt: created.assessed_at,
    };
  },
};

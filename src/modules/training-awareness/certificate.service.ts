import { AppError } from '../../common/errors/app-error.js';
import { certificateRepository } from './certificate.repository.js';

type Actor = { userId: string; permissions: readonly string[] };
function requirePermission(actor: Actor, permission: string) {
  if (!actor.permissions.includes(permission))
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
}
function mapCertificate(
  result: NonNullable<Awaited<ReturnType<typeof certificateRepository.get>>>,
) {
  const { enrollment, eligible } = result;
  const certificate = enrollment.training_certificates;
  return {
    enrollmentId: enrollment.training_enrollment_id,
    learnerName: enrollment.users.full_name,
    courseTitle: enrollment.training_campaigns.training_courses.title,
    campaignTitle: enrollment.training_campaigns.title,
    completedAt: enrollment.completed_at,
    eligible,
    certificate: certificate
      ? {
          id: certificate.training_certificate_id,
          number: certificate.certificate_number,
          issuedAt: certificate.issued_at,
          issuedBy: certificate.users?.full_name ?? null,
        }
      : null,
  };
}
export const certificateService = {
  async get(id: string, actor: Actor) {
    requirePermission(actor, 'training-completion.read');
    const result = await certificateRepository.get(id);
    if (!result)
      throw new AppError(404, 'TRAINING_ENROLLMENT_NOT_FOUND', 'Training enrollment not found');
    return mapCertificate(result);
  },
  async issue(
    id: string,
    actor: Actor,
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    requirePermission(actor, 'training-certificates.issue');
    const result = await certificateRepository.issue(id, { ...context, actorUserId: actor.userId });
    if (result.kind === 'missing')
      throw new AppError(404, 'TRAINING_ENROLLMENT_NOT_FOUND', 'Training enrollment not found');
    if (result.kind === 'ineligible')
      throw new AppError(
        409,
        'CERTIFICATE_NOT_ELIGIBLE',
        'Complete the course and pass its assessment before issuing a certificate',
      );
    return mapCertificate(result.result);
  },
};

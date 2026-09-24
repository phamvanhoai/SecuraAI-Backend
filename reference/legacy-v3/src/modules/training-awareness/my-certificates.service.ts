import { AppError } from '../../common/errors/app-error.js';
import type { MyCertificatesQuery } from './dto/my-certificates.dto.js';
import { myCertificatesRepository } from './my-certificates.repository.js';

export const myCertificatesService = {
  async list(
    query: MyCertificatesQuery,
    actor: { userId: string; permissions: readonly string[] },
  ) {
    if (!actor.permissions.includes('training-certificates.read-own'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await myCertificatesRepository.list(actor.userId, query);
    return {
      items: result.items.map((item) => ({
        id: item.training_certificate_id,
        number: item.certificate_number,
        issuedAt: item.issued_at,
        issuedBy: item.users?.full_name ?? null,
        enrollmentId: item.training_enrollments.training_enrollment_id,
        completedAt: item.training_enrollments.completed_at,
        campaignTitle: item.training_enrollments.training_campaigns.title,
        courseTitle: item.training_enrollments.training_campaigns.training_courses.title,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / query.limit)),
      },
    };
  },
};

import { AppError } from '../../common/errors/app-error.js';
import type { IssuedCertificatesQuery } from './dto/issued-certificates.dto.js';
import { issuedCertificatesRepository } from './issued-certificates.repository.js';

export const issuedCertificatesService = {
  async list(query: IssuedCertificatesQuery, actor: { permissions: readonly string[] }) {
    if (!actor.permissions.includes('training-certificates.read-issued'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await issuedCertificatesRepository.list(query);
    return {
      items: result.items.map((item) => ({
        id: item.training_certificate_id,
        number: item.certificate_number,
        issuedAt: item.issued_at,
        issuedBy: item.users?.full_name ?? null,
        enrollmentId: item.training_enrollments.training_enrollment_id,
        completedAt: item.training_enrollments.completed_at,
        learner: {
          name: item.training_enrollments.users.full_name,
          email: item.training_enrollments.users.email,
          employeeCode: item.training_enrollments.users.employee_code,
          department: item.training_enrollments.users.departments?.name ?? null,
        },
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

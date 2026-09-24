import { AppError } from '../../common/errors/app-error.js';
import { courseArchiveRepository } from './course-archive.repository.js';
export const courseArchiveService = {
  async archive(
    courseId: string,
    actor: { userId: string; permissions: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('training-courses.archive'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await courseArchiveRepository.archive(courseId, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.kind === 'not_found')
      throw new AppError(404, 'TRAINING_COURSE_NOT_FOUND', 'Training course not found');
    if (result.kind === 'not_published')
      throw new AppError(
        409,
        'TRAINING_COURSE_NOT_PUBLISHED',
        'Only published courses can be archived',
      );
    if (result.kind === 'active_campaign')
      throw new AppError(
        409,
        'TRAINING_COURSE_ACTIVE_CAMPAIGN',
        'Courses with active campaigns cannot be archived',
      );
    if (result.kind === 'conflict')
      throw new AppError(
        409,
        'TRAINING_COURSE_CHANGED',
        'The course changed. Reload and try again',
      );
    return { archived: true };
  },
};

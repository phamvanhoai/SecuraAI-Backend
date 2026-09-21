import { AppError } from '../../common/errors/app-error.js';
import type { DuplicateCourseBody } from './dto/duplicate-course.dto.js';
import { courseDuplicateRepository } from './course-duplicate.repository.js';

export const courseDuplicateService = {
  async duplicate(
    courseId: string,
    input: DuplicateCourseBody,
    actor: { userId: string; permissions: readonly string[] },
    context: { ipAddress: string | null; userAgent: string | null },
  ) {
    if (!actor.permissions.includes('training-courses.duplicate'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const course = await courseDuplicateRepository.duplicate(courseId, input.title, {
      actorUserId: actor.userId,
      ...context,
    });
    if (!course)
      throw new AppError(404, 'TRAINING_COURSE_NOT_FOUND', 'Training course not found');
    return {
      id: course.training_course_id,
      title: course.title,
      description: course.description,
      content: course.content,
      status: course.status,
      createdByUserId: course.created_by_user_id,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
    };
  },
};

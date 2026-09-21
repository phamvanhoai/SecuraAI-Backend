import { AppError } from '../../common/errors/app-error.js';
import { coursePublishRepository } from './course-publish.repository.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

export const coursePublishService = {
  async publish(courseId: string, actor: Actor, context: RequestContext) {
    if (!actor.permissions.includes('training-courses.publish'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await coursePublishRepository.publish(courseId, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.kind === 'not_found')
      throw new AppError(404, 'TRAINING_COURSE_NOT_FOUND', 'Training course not found');
    if (result.kind === 'not_draft')
      throw new AppError(409, 'TRAINING_COURSE_NOT_DRAFT', 'Only draft courses can be published');
    if (result.kind === 'in_use')
      throw new AppError(409, 'TRAINING_COURSE_IN_USE', 'Assigned courses cannot be published');
    if (result.kind === 'no_lessons')
      throw new AppError(
        422,
        'TRAINING_COURSE_HAS_NO_LESSONS',
        'Add at least one lesson before publishing',
      );
    if (result.kind === 'lesson_without_material')
      throw new AppError(
        422,
        'TRAINING_LESSON_HAS_NO_MATERIAL',
        'Every lesson requires at least one training material before publishing',
      );
    if (result.kind === 'conflict')
      throw new AppError(
        409,
        'TRAINING_COURSE_CHANGED',
        'The course changed. Reload and try again',
      );
    return {
      id: result.course.training_course_id,
      title: result.course.title,
      description: result.course.description,
      content: result.course.content,
      status: result.course.status,
      createdByUserId: result.course.created_by_user_id,
      createdAt: result.course.created_at,
      updatedAt: result.course.updated_at,
    };
  },
};

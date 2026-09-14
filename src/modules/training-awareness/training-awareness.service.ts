import { AppError } from '../../common/errors/app-error.js';
import { trainingAwarenessRepository, type CourseRecord } from './training-awareness.repository.js';
import type { CreateCourseBody, ListCoursesQuery } from './dto/course.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

const toCourseResponse = (course: CourseRecord) => ({
  id: course.training_course_id, title: course.title, description: course.description,
  content: course.content, status: course.status,
  createdByUserId: course.created_by_user_id,
  createdAt: course.created_at, updatedAt: course.updated_at,
});

export const trainingAwarenessService = {
  async listCourses(query: ListCoursesQuery, actor: Actor) {
    if (!actor.permissions.includes('training-courses.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.listCourses(query);
    return {
      items: result.items.map(toCourseResponse),
      pagination: { page: query.page, limit: query.limit, total: result.total,
        totalPages: Math.ceil(result.total / query.limit) },
    };
  },
  async createCourse(input: CreateCourseBody, actor: Actor, context: RequestContext) {
    if (!actor.permissions.includes('training-courses.create'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const course = await trainingAwarenessRepository.createCourse(input, {
      actorUserId: actor.userId, ...context,
    });
    return toCourseResponse(course);
  },
};

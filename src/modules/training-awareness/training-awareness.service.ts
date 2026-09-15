import { AppError } from '../../common/errors/app-error.js';
import { trainingAwarenessRepository, type CourseRecord } from './training-awareness.repository.js';
import type { AssignCourseBody, CreateCourseBody, ListCoursesQuery } from './dto/course.dto.js';

type Actor = { userId: string; permissions: readonly string[] };
type RequestContext = { ipAddress: string | null; userAgent: string | null };

const toCourseResponse = (course: CourseRecord) => ({
  id: course.training_course_id,
  title: course.title,
  description: course.description,
  content: course.content,
  status: course.status,
  createdByUserId: course.created_by_user_id,
  createdAt: course.created_at,
  updatedAt: course.updated_at,
});

export const trainingAwarenessService = {
  async listCourses(query: ListCoursesQuery, actor: Actor) {
    if (!actor.permissions.includes('training-courses.read'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.listCourses(query);
    return {
      items: result.items.map(toCourseResponse),
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  async createCourse(input: CreateCourseBody, actor: Actor, context: RequestContext) {
    if (!actor.permissions.includes('training-courses.create'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const course = await trainingAwarenessRepository.createCourse(input, {
      actorUserId: actor.userId,
      ...context,
    });
    return toCourseResponse(course);
  },
  async listAssignmentOptions(actor: Actor) {
    if (!actor.permissions.includes('training-courses.assign'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.listAssignmentOptions();
    return {
      users: result.users.map((user) => ({
        id: user.user_id,
        name: user.full_name,
        email: user.email,
        departmentId: user.department_id,
      })),
      departments: result.departments.map((department) => ({
        id: department.department_id,
        code: department.code,
        name: department.name,
      })),
      truncated: {
        users: result.users.length === 200,
        departments: result.departments.length === 200,
      },
    };
  },
  async assignCourse(
    courseId: string,
    input: AssignCourseBody,
    actor: Actor,
    context: RequestContext,
  ) {
    if (!actor.permissions.includes('training-courses.assign'))
      throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
    const result = await trainingAwarenessRepository.assignCourse(courseId, input, {
      actorUserId: actor.userId,
      ...context,
    });
    if (result.kind === 'course_not_found')
      throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
    if (result.kind === 'invalid_targets')
      throw new AppError(
        422,
        'INVALID_ASSIGNMENT_TARGETS',
        'One or more assignment targets are unavailable',
      );
    return {
      id: result.campaign.training_campaign_id,
      title: result.campaign.title,
      startDate: result.campaign.start_date,
      dueDate: result.campaign.due_date,
      enrollmentCount: result.enrollmentCount,
      createdAt: result.campaign.created_at,
    };
  },
};

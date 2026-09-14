import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { CreateCourseBody, ListCoursesQuery } from './dto/course.dto.js';

const courseSelect = {
  training_course_id: true, title: true, description: true, content: true,
  status: true, created_by_user_id: true, created_at: true, updated_at: true,
} satisfies Prisma.training_coursesSelect;

export type CourseRecord = Prisma.training_coursesGetPayload<{ select: typeof courseSelect }>;
type RequestContext = { actorUserId: string; ipAddress: string | null; userAgent: string | null };

export const trainingAwarenessRepository = {
  async listCourses(query: ListCoursesQuery): Promise<{ items: CourseRecord[]; total: number }> {
    const where: Prisma.training_coursesWhereInput = query.q
      ? { title: { contains: query.q, mode: 'insensitive' } }
      : {};
    const [total, items] = await prisma.$transaction([
      prisma.training_courses.count({ where }),
      prisma.training_courses.findMany({
        where, select: courseSelect,
        orderBy: [{ created_at: 'desc' }, { training_course_id: 'desc' }],
        skip: (query.page - 1) * query.limit, take: query.limit,
      }),
    ]);
    return { items, total };
  },
  createCourse(input: CreateCourseBody, context: RequestContext): Promise<CourseRecord> {
    return prisma.$transaction(async (transaction) => {
      const course = await transaction.training_courses.create({
        data: {
          title: input.title, description: input.description ?? null,
          content: input.content, status: 'draft', created_by_user_id: context.actorUserId,
        },
        select: courseSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId, module: 'training-awareness',
          action: 'training_course.created', entity_type: 'training_course',
          entity_id: course.training_course_id,
          after_data: { title: course.title, status: course.status },
          ip_address: context.ipAddress, user_agent: context.userAgent,
        },
      });
      return course;
    });
  },
};

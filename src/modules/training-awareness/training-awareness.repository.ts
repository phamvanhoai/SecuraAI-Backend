import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type {
  AssignCourseBody,
  AssignmentOptionsQuery,
  CreateCourseBody,
  ListCoursesQuery,
} from './dto/course.dto.js';

const courseSelect = {
  training_course_id: true,
  title: true,
  description: true,
  content: true,
  status: true,
  created_by_user_id: true,
  created_at: true,
  updated_at: true,
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
        where,
        select: courseSelect,
        orderBy: [{ created_at: 'desc' }, { training_course_id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { items, total };
  },
  createCourse(input: CreateCourseBody, context: RequestContext): Promise<CourseRecord> {
    return prisma.$transaction(async (transaction) => {
      const course = await transaction.training_courses.create({
        data: {
          title: input.title,
          description: input.description ?? null,
          content: input.content,
          status: 'draft',
          created_by_user_id: context.actorUserId,
        },
        select: courseSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: 'training_course.created',
          entity_type: 'training_course',
          entity_id: course.training_course_id,
          after_data: { title: course.title, status: course.status },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return course;
    });
  },
  async listAssignmentOptions(query: AssignmentOptionsQuery) {
    const [users, departments] = await prisma.$transaction([
      prisma.users.findMany({
        where: {
          status: 'active',
          deleted_at: null,
          ...(query.userQ
            ? {
                OR: [
                  { full_name: { contains: query.userQ, mode: 'insensitive' } },
                  { email: { contains: query.userQ, mode: 'insensitive' } },
                  { employee_code: { contains: query.userQ, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { user_id: true, full_name: true, email: true, department_id: true },
        orderBy: [{ full_name: 'asc' }, { email: 'asc' }],
        take: query.limit + 1,
      }),
      prisma.departments.findMany({
        where: {
          status: 'active',
          ...(query.departmentQ
            ? {
                OR: [
                  { name: { contains: query.departmentQ, mode: 'insensitive' } },
                  { code: { contains: query.departmentQ, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: { department_id: true, code: true, name: true },
        orderBy: { name: 'asc' },
        take: query.limit + 1,
      }),
    ]);
    return {
      users: users.slice(0, query.limit),
      departments: departments.slice(0, query.limit),
      hasMoreUsers: users.length > query.limit,
      hasMoreDepartments: departments.length > query.limit,
    };
  },
  async assignCourse(courseId: string, input: AssignCourseBody, context: RequestContext) {
    return prisma.$transaction(async (transaction) => {
      const course = await transaction.training_courses.findUnique({
        where: { training_course_id: courseId },
        select: { training_course_id: true, status: true },
      });
      if (!course || course.status === 'archived') return { kind: 'course_not_found' as const };

      const uniqueUserIds = [...new Set(input.userIds)];
      const uniqueDepartmentIds = [...new Set(input.departmentIds)];
      const [users, departments] = await Promise.all([
        transaction.users.findMany({
          where: {
            status: 'active',
            deleted_at: null,
            OR: [
              ...(uniqueUserIds.length ? [{ user_id: { in: uniqueUserIds } }] : []),
              ...(uniqueDepartmentIds.length
                ? [{ department_id: { in: uniqueDepartmentIds } }]
                : []),
            ],
          },
          select: { user_id: true },
        }),
        transaction.departments.findMany({
          where: { department_id: { in: uniqueDepartmentIds }, status: 'active' },
          select: { department_id: true },
        }),
      ]);
      const resolvedUserIds = [...new Set(users.map((user) => user.user_id))];
      if (
        departments.length !== uniqueDepartmentIds.length ||
        uniqueUserIds.some((id) => !resolvedUserIds.includes(id))
      ) {
        return { kind: 'invalid_targets' as const };
      }

      const campaign = await transaction.training_campaigns.create({
        data: {
          training_course_id: courseId,
          title: input.title,
          assigned_by_user_id: context.actorUserId,
          start_date: new Date(`${input.startDate}T00:00:00.000Z`),
          due_date: new Date(`${input.dueDate}T00:00:00.000Z`),
          training_campaign_targets: {
            create: [
              ...uniqueUserIds.map((userId) => ({ user_id: userId })),
              ...uniqueDepartmentIds.map((departmentId) => ({ department_id: departmentId })),
            ],
          },
          training_enrollments: { create: resolvedUserIds.map((userId) => ({ user_id: userId })) },
        },
        select: {
          training_campaign_id: true,
          title: true,
          start_date: true,
          due_date: true,
          created_at: true,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: 'training_course.assigned',
          entity_type: 'training_campaign',
          entity_id: campaign.training_campaign_id,
          after_data: {
            courseId,
            userIds: uniqueUserIds,
            departmentIds: uniqueDepartmentIds,
            enrollmentCount: resolvedUserIds.length,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return { kind: 'assigned' as const, campaign, enrollmentCount: resolvedUserIds.length };
    });
  },
};

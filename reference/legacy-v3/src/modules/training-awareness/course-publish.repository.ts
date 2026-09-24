import { prisma } from '../../database/prisma.js';

type RequestContext = {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export const coursePublishRepository = {
  publish(courseId: string, context: RequestContext) {
    return prisma.$transaction(async (transaction) => {
      const course = await transaction.training_courses.findUnique({
        where: { training_course_id: courseId },
        select: {
          training_course_id: true,
          title: true,
          description: true,
          content: true,
          status: true,
          created_by_user_id: true,
          created_at: true,
          updated_at: true,
          training_campaigns: { select: { training_campaign_id: true }, take: 1 },
          training_lessons: {
            select: {
              training_lesson_id: true,
              title: true,
              training_materials: { select: { training_material_id: true }, take: 1 },
            },
          },
        },
      });
      if (!course) return { kind: 'not_found' as const };
      if (course.status !== 'draft') return { kind: 'not_draft' as const };
      if (course.training_campaigns.length) return { kind: 'in_use' as const };
      if (!course.training_lessons.length) return { kind: 'no_lessons' as const };
      if (course.training_lessons.some((lesson) => !lesson.training_materials.length))
        return { kind: 'lesson_without_material' as const };

      const changed = await transaction.training_courses.updateMany({
        where: { training_course_id: courseId, status: 'draft', training_campaigns: { none: {} } },
        data: { status: 'published', updated_at: new Date() },
      });
      if (!changed.count) return { kind: 'conflict' as const };
      const published = await transaction.training_courses.findUniqueOrThrow({
        where: { training_course_id: courseId },
        select: {
          training_course_id: true,
          title: true,
          description: true,
          content: true,
          status: true,
          created_by_user_id: true,
          created_at: true,
          updated_at: true,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: 'training_course.published',
          entity_type: 'training_course',
          entity_id: courseId,
          before_data: { status: course.status },
          after_data: {
            status: published.status,
            lessonCount: course.training_lessons.length,
          },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return { kind: 'published' as const, course: published };
    });
  },
};

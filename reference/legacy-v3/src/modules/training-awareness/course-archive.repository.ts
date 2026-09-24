import { prisma } from '../../database/prisma.js';
export const courseArchiveRepository = {
  archive(
    courseId: string,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(async (tx) => {
      const course = await tx.training_courses.findUnique({
        where: { training_course_id: courseId },
        select: {
          status: true,
          training_campaigns: {
            select: { training_campaign_id: true, start_date: true, due_date: true },
            take: 20,
          },
        },
      });
      if (!course) return { kind: 'not_found' as const };
      if (course.status !== 'published') return { kind: 'not_published' as const };
      const now = new Date();
      if (
        course.training_campaigns.some(
          (campaign) => campaign.start_date <= now && campaign.due_date >= now,
        )
      )
        return { kind: 'active_campaign' as const };
      const changed = await tx.training_courses.updateMany({
        where: { training_course_id: courseId, status: 'published' },
        data: { status: 'archived', updated_at: new Date() },
      });
      if (!changed.count) return { kind: 'conflict' as const };
      await tx.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: 'training_course.archived',
          entity_type: 'training_course',
          entity_id: courseId,
          before_data: { status: 'published' },
          after_data: { status: 'archived' },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return { kind: 'archived' as const };
    });
  },
};

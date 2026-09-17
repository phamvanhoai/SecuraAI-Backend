import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { utcDay } from './training-reminder-policy.js';

const recipientWhere = {
  status: 'active',
  deleted_at: null,
  disabled_at: null,
  user_roles_user_roles_user_idTousers: {
    some: {
      roles: { role_permissions: { some: { permissions: { code: 'training-assessments.take' } } } },
    },
  },
} satisfies Prisma.usersWhereInput;

const enrollmentSelect = {
  training_enrollment_id: true,
  user_id: true,
  training_campaigns: {
    select: {
      due_date: true,
      title: true,
      training_courses: { select: { title: true, training_course_id: true } },
    },
  },
} satisfies Prisma.training_enrollmentsSelect;
type Enrollment = Prisma.training_enrollmentsGetPayload<{ select: typeof enrollmentSelect }>;

export const trainingRemindersRepository = {
  findCandidates(now: Date) {
    const today = utcDay(now);
    // Exclude existing deterministic keys before LIMIT so completed jobs cannot
    // starve later employees. No database extension or schema change is needed.
    return prisma.$queryRaw<{ training_enrollment_id: string }[]>(Prisma.sql`
      SELECT e.training_enrollment_id
      FROM training_enrollments e
      JOIN training_campaigns c ON c.training_campaign_id = e.training_campaign_id
      JOIN training_courses course ON course.training_course_id = c.training_course_id
      JOIN users u ON u.user_id = e.user_id
      WHERE e.status IN ('assigned', 'in_progress', 'overdue')
        AND e.completed_at IS NULL AND e.progress_percent < 100
        AND course.status = 'published' AND c.start_date <= ${today}::date
        AND c.due_date BETWEEN ${today}::date AND ${today}::date + 3
        AND u.status = 'active' AND u.deleted_at IS NULL AND u.disabled_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM training_certificates cert
          WHERE cert.training_enrollment_id = e.training_enrollment_id)
        AND NOT EXISTS (SELECT 1 FROM quiz_attempts qa
          WHERE qa.user_id = e.user_id AND qa.passed = true AND qa.submitted_at IS NOT NULL
            AND qa.quiz_id = (SELECT q.quiz_id FROM quizzes q
              WHERE q.training_course_id = course.training_course_id
              ORDER BY q.created_at DESC, q.quiz_id DESC LIMIT 1))
        AND EXISTS (SELECT 1 FROM user_roles ur
          JOIN role_permissions rp ON rp.role_id = ur.role_id
          JOIN permissions p ON p.permission_id = rp.permission_id
          WHERE ur.user_id = e.user_id AND p.code = 'training-assessments.take')
        AND NOT EXISTS (SELECT 1 FROM notification_preferences pref
          WHERE pref.user_id = e.user_id AND pref.event_type = 'training_deadline_reminder'
            AND pref.in_app_enabled = false)
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.notification_id =
          overlay(overlay(md5('training-deadline:' || e.training_enrollment_id::text || ':' ||
            to_char(c.due_date, 'YYYY-MM-DD') || ':' ||
            CASE WHEN c.due_date - ${today}::date <= 1 THEN '1' ELSE '3' END)
            placing '5' from 13 for 1) placing '8' from 17 for 1)::uuid)
      ORDER BY c.due_date, e.training_enrollment_id
      LIMIT 100
    `);
  },

  processCandidate(
    enrollmentId: string,
    now: Date,
    deliver: (enrollment: Enrollment, tx: Prisma.TransactionClient) => Promise<boolean>,
  ) {
    const today = utcDay(now);
    return prisma.$transaction(async (tx) => {
      // Lock the campaign and enrollment: reassignment, completion and withdrawal
      // must finish before eligibility is checked again inside this transaction.
      await tx.$queryRaw(Prisma.sql`
        SELECT c.training_campaign_id FROM training_campaigns c
        WHERE c.training_campaign_id = (SELECT e.training_campaign_id FROM training_enrollments e
          WHERE e.training_enrollment_id = ${enrollmentId}::uuid) FOR UPDATE OF c
      `);
      await tx.$queryRaw(Prisma.sql`
        SELECT e.training_enrollment_id FROM training_enrollments e
        WHERE e.training_enrollment_id = ${enrollmentId}::uuid FOR UPDATE OF e
      `);
      const enrollment = await tx.training_enrollments.findFirst({
        where: {
          training_enrollment_id: enrollmentId,
          status: { in: ['assigned', 'in_progress', 'overdue'] },
          completed_at: null,
          progress_percent: { lt: 100 },
          training_certificates: { is: null },
          users: recipientWhere,
          training_campaigns: {
            start_date: { lte: today },
            due_date: { gte: today, lte: new Date(today.getTime() + 3 * 86_400_000) },
            training_courses: { status: 'published' },
          },
        },
        select: enrollmentSelect,
      });
      if (!enrollment) return false;
      // Assessment availability already treats a passed latest quiz as complete,
      // even if a historical/reassigned enrollment still has stale progress.
      const latestQuiz = await tx.quizzes.findFirst({
        where: {
          training_course_id: enrollment.training_campaigns.training_courses.training_course_id,
        },
        orderBy: [{ created_at: 'desc' }, { quiz_id: 'desc' }],
        select: {
          quiz_attempts: {
            where: { user_id: enrollment.user_id, passed: true, submitted_at: { not: null } },
            take: 1,
            select: { quiz_attempt_id: true },
          },
        },
      });
      if (latestQuiz?.quiz_attempts.length) return false;
      const preference = await tx.notification_preferences.findUnique({
        where: {
          user_id_event_type: {
            user_id: enrollment.user_id,
            event_type: 'training_deadline_reminder',
          },
        },
        select: { in_app_enabled: true },
      });
      if (preference?.in_app_enabled === false) return false;
      return deliver(enrollment, tx);
    });
  },
};

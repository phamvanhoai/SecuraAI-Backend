import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

const certificateSelect = {
  training_certificate_id: true,
  certificate_number: true,
  issued_at: true,
  users: { select: { full_name: true } },
} satisfies Prisma.training_certificatesSelect;

const enrollmentSelect = {
  training_enrollment_id: true,
  user_id: true,
  status: true,
  progress_percent: true,
  completed_at: true,
  users: { select: { full_name: true } },
  training_certificates: { select: certificateSelect },
  training_campaigns: {
    select: {
      title: true,
      training_courses: {
        select: {
          title: true,
          quizzes: {
            orderBy: [{ created_at: 'desc' as const }, { quiz_id: 'desc' as const }],
            take: 1,
            select: { quiz_id: true },
          },
        },
      },
    },
  },
} satisfies Prisma.training_enrollmentsSelect;

async function readEnrollment(client: Prisma.TransactionClient, id: string) {
  const enrollment = await client.training_enrollments.findUnique({
    where: { training_enrollment_id: id },
    select: enrollmentSelect,
  });
  if (!enrollment) return null;
  const quiz = enrollment.training_campaigns.training_courses.quizzes[0];
  const passed = quiz
    ? await client.quiz_attempts.findFirst({
        where: {
          quiz_id: quiz.quiz_id,
          user_id: enrollment.user_id,
          passed: true,
          submitted_at: { not: null },
        },
        select: { quiz_attempt_id: true },
      })
    : null;
  return {
    enrollment,
    eligible:
      enrollment.status === 'completed' &&
      enrollment.progress_percent === 100 &&
      enrollment.completed_at !== null &&
      passed !== null,
  };
}

export const certificateRepository = {
  get(id: string) {
    return readEnrollment(prisma, id);
  },
  issue(
    id: string,
    context: { actorUserId: string; ipAddress: string | null; userAgent: string | null },
  ) {
    return prisma.$transaction(async (tx) => {
      // Serialize issuers on the enrollment; the unique constraint remains a final safeguard.
      await tx.$queryRaw`SELECT training_enrollment_id FROM training_enrollments
        WHERE training_enrollment_id = ${id}::uuid FOR UPDATE`;
      const result = await readEnrollment(tx, id);
      if (!result) return { kind: 'missing' as const };
      if (result.enrollment.training_certificates) return { kind: 'issued' as const, result };
      if (!result.eligible) return { kind: 'ineligible' as const };
      const certificate = await tx.training_certificates.create({
        data: {
          training_enrollment_id: id,
          certificate_number: `SEC-TR-${randomUUID().toUpperCase()}`,
          issued_by_user_id: context.actorUserId,
        },
        select: certificateSelect,
      });
      await tx.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: 'training_certificate.issued',
          entity_type: 'training_certificate',
          entity_id: certificate.training_certificate_id,
          after_data: { enrollmentId: id, certificateNumber: certificate.certificate_number },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return {
        kind: 'issued' as const,
        result: {
          ...result,
          enrollment: { ...result.enrollment, training_certificates: certificate },
        },
      };
    });
  },
};

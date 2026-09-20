import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { LearningListQuery } from './dto/learning.dto.js';

const activeEnrollment = (userId: string): Prisma.training_enrollmentsWhereInput => ({
  user_id: userId,
  status: { not: 'withdrawn' },
});

export const learningRepository = {
  findMaterial(enrollmentId: string, materialId: string, userId: string) {
    return prisma.training_materials.findFirst({
      where: {
        training_material_id: materialId,
        training_lessons: {
          training_courses: {
            training_campaigns: {
              some: {
                training_enrollments: {
                  some: {
                    training_enrollment_id: enrollmentId,
                    user_id: userId,
                    status: { not: 'withdrawn' },
                  },
                },
              },
            },
          },
        },
      },
      select: { files: { select: { storage_key: true, original_name: true } } },
    });
  },
  async list(userId: string, query: LearningListQuery) {
    const where = activeEnrollment(userId);
    const [total, items] = await prisma.$transaction([
      prisma.training_enrollments.count({ where }),
      prisma.training_enrollments.findMany({
        where,
        select: {
          training_enrollment_id: true,
          status: true,
          progress_percent: true,
          started_at: true,
          completed_at: true,
          training_campaigns: {
            select: {
              title: true,
              start_date: true,
              due_date: true,
              training_courses: { select: { title: true, description: true } },
            },
          },
        },
        orderBy: [{ training_campaigns: { due_date: 'asc' } }, { training_enrollment_id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return { total, items };
  },
  find(enrollmentId: string, userId: string) {
    return prisma.training_enrollments.findFirst({
      where: { training_enrollment_id: enrollmentId, ...activeEnrollment(userId) },
      select: {
        training_enrollment_id: true,
        status: true,
        progress_percent: true,
        started_at: true,
        completed_at: true,
        last_accessed_at: true,
        training_lesson_progress: {
          select: { training_lesson_id: true, status: true, completed_at: true },
        },
        training_campaigns: {
          select: {
            title: true,
            start_date: true,
            due_date: true,
            training_courses: {
              select: {
                training_course_id: true,
                title: true,
                description: true,
                content: true,
                training_lessons: {
                  orderBy: [{ display_order: 'asc' }, { training_lesson_id: 'asc' }],
                  select: {
                    training_lesson_id: true,
                    title: true,
                    description: true,
                    display_order: true,
                    is_required: true,
                    training_materials: {
                      orderBy: [{ display_order: 'asc' }, { training_material_id: 'asc' }],
                      select: {
                        training_material_id: true,
                        title: true,
                        material_type: true,
                        content: true,
                        external_url: true,
                        files: {
                          select: { original_name: true, mime_type: true, size_bytes: true },
                        },
                      },
                    },
                    quizzes: {
                      select: {
                        quiz_id: true,
                        title: true,
                        passing_score: true,
                        max_attempts: true,
                        quiz_attempts: {
                          where: {
                            training_enrollment_id: enrollmentId,
                            submitted_at: { not: null },
                          },
                          select: { passed: true },
                        },
                      },
                    },
                  },
                },
                quizzes: {
                  where: { training_lesson_id: null },
                  select: {
                    quiz_id: true,
                    title: true,
                    passing_score: true,
                    max_attempts: true,
                    quiz_attempts: {
                      where: { training_enrollment_id: enrollmentId, submitted_at: { not: null } },
                      select: { passed: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  },
  completeLesson(enrollmentId: string, lessonId: string, userId: string) {
    return prisma.$transaction(
      async (tx) => {
        const enrollment = await tx.training_enrollments.findFirst({
          where: {
            training_enrollment_id: enrollmentId,
            user_id: userId,
            status: { notIn: ['withdrawn', 'completed'] },
          },
          select: {
            training_enrollment_id: true,
            started_at: true,
            training_campaigns: {
              select: { start_date: true, due_date: true, training_course_id: true },
            },
          },
        });
        if (!enrollment) return { kind: 'not_found' as const };
        const now = new Date();
        const end = new Date(enrollment.training_campaigns.due_date);
        end.setUTCDate(end.getUTCDate() + 1);
        if (now < enrollment.training_campaigns.start_date || now >= end)
          return { kind: 'not_available' as const };
        const lesson = await tx.training_lessons.findFirst({
          where: {
            training_lesson_id: lessonId,
            training_course_id: enrollment.training_campaigns.training_course_id,
          },
          select: {
            training_lesson_id: true,
            quizzes: {
              select: {
                quiz_id: true,
                quiz_attempts: {
                  where: { training_enrollment_id: enrollmentId, passed: true },
                  select: { quiz_attempt_id: true },
                  take: 1,
                },
              },
            },
          },
        });
        if (!lesson) return { kind: 'not_found' as const };
        if (lesson.quizzes.some((quiz) => quiz.quiz_attempts.length === 0))
          return { kind: 'assessment_required' as const };
        await tx.training_lesson_progress.upsert({
          where: {
            training_enrollment_id_training_lesson_id: {
              training_enrollment_id: enrollmentId,
              training_lesson_id: lessonId,
            },
          },
          create: {
            training_enrollment_id: enrollmentId,
            training_lesson_id: lessonId,
            status: 'completed',
            started_at: now,
            completed_at: now,
            last_accessed_at: now,
          },
          update: { status: 'completed', completed_at: now, last_accessed_at: now },
        });
        const required = await tx.training_lessons.count({
          where: {
            training_course_id: enrollment.training_campaigns.training_course_id,
            is_required: true,
          },
        });
        const completed = required
          ? await tx.training_lesson_progress.count({
              where: {
                training_enrollment_id: enrollmentId,
                status: 'completed',
                training_lessons: { is_required: true },
              },
            })
          : 0;
        const finalQuiz = await tx.quizzes.findFirst({
          where: {
            training_course_id: enrollment.training_campaigns.training_course_id,
            training_lesson_id: null,
          },
          select: {
            quiz_attempts: {
              where: { training_enrollment_id: enrollmentId, passed: true },
              take: 1,
            },
          },
        });
        const allLessons = completed === required;
        const finished = allLessons && (!finalQuiz || finalQuiz.quiz_attempts.length > 0);
        const progress = finished ? 100 : required ? Math.floor((completed / required) * 90) : 0;
        await tx.training_enrollments.update({
          where: { training_enrollment_id: enrollmentId },
          data: {
            status: finished ? 'completed' : 'in_progress',
            progress_percent: progress,
            started_at: enrollment.started_at ?? now,
            last_accessed_at: now,
            ...(finished ? { completed_at: now } : {}),
          },
        });
        return { kind: 'completed' as const, progress, courseCompleted: finished };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  },
};

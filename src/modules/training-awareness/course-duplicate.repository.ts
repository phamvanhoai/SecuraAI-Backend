import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

type Context = { actorUserId: string; ipAddress: string | null; userAgent: string | null };

const sourceSelect = {
  training_course_id: true,
  title: true,
  description: true,
  content: true,
  training_lessons: {
    orderBy: [{ display_order: 'asc' as const }, { training_lesson_id: 'asc' as const }],
    select: {
      title: true,
      description: true,
      display_order: true,
      is_required: true,
      training_materials: {
        orderBy: [{ display_order: 'asc' as const }, { training_material_id: 'asc' as const }],
        select: {
          title: true,
          material_type: true,
          content: true,
          external_url: true,
          file_id: true,
          display_order: true,
        },
      },
      quizzes: {
        orderBy: [{ created_at: 'asc' as const }, { quiz_id: 'asc' as const }],
        select: {
          title: true,
          passing_score: true,
          max_attempts: true,
          quiz_questions: {
            orderBy: [{ display_order: 'asc' as const }, { quiz_question_id: 'asc' as const }],
            select: {
              question_text: true,
              question_type: true,
              score: true,
              display_order: true,
              quiz_options: {
                orderBy: [{ display_order: 'asc' as const }, { quiz_option_id: 'asc' as const }],
                select: { option_text: true, is_correct: true, display_order: true },
              },
            },
          },
        },
      },
    },
  },
  quizzes: {
    where: { training_lesson_id: null },
    orderBy: [{ created_at: 'asc' as const }, { quiz_id: 'asc' as const }],
    select: {
      title: true,
      passing_score: true,
      max_attempts: true,
      quiz_questions: {
        orderBy: [{ display_order: 'asc' as const }, { quiz_question_id: 'asc' as const }],
        select: {
          question_text: true,
          question_type: true,
          score: true,
          display_order: true,
          quiz_options: {
            orderBy: [{ display_order: 'asc' as const }, { quiz_option_id: 'asc' as const }],
            select: { option_text: true, is_correct: true, display_order: true },
          },
        },
      },
    },
  },
} satisfies Prisma.training_coursesSelect;

type Quiz = Prisma.training_coursesGetPayload<{ select: typeof sourceSelect }>['quizzes'][number];

async function copyQuiz(
  transaction: Prisma.TransactionClient,
  courseId: string,
  lessonId: string | null,
  quiz: Quiz,
): Promise<void> {
  await transaction.quizzes.create({
    data: {
      training_course_id: courseId,
      training_lesson_id: lessonId,
      title: quiz.title,
      passing_score: quiz.passing_score,
      max_attempts: quiz.max_attempts,
      quiz_questions: {
        create: quiz.quiz_questions.map((question) => ({
          question_text: question.question_text,
          question_type: question.question_type,
          score: question.score,
          display_order: question.display_order,
          quiz_options: { create: question.quiz_options },
        })),
      },
    },
  });
}

export const courseDuplicateRepository = {
  duplicate(sourceCourseId: string, title: string, context: Context) {
    return prisma.$transaction(async (transaction) => {
      const source = await transaction.training_courses.findUnique({
        where: { training_course_id: sourceCourseId },
        select: sourceSelect,
      });
      if (!source) return null;
      const copy = await transaction.training_courses.create({
        data: {
          title,
          description: source.description,
          content: source.content,
          status: 'draft',
          created_by_user_id: context.actorUserId,
        },
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
      for (const lesson of source.training_lessons) {
        const createdLesson = await transaction.training_lessons.create({
          data: {
            training_course_id: copy.training_course_id,
            title: lesson.title,
            description: lesson.description,
            display_order: lesson.display_order,
            is_required: lesson.is_required,
            training_materials: { create: lesson.training_materials },
          },
          select: { training_lesson_id: true },
        });
        for (const quiz of lesson.quizzes)
          await copyQuiz(transaction, copy.training_course_id, createdLesson.training_lesson_id, quiz);
      }
      for (const quiz of source.quizzes)
        await copyQuiz(transaction, copy.training_course_id, null, quiz);
      await transaction.audit_logs.create({
        data: {
          actor_user_id: context.actorUserId,
          module: 'training-awareness',
          action: 'training_course.duplicated',
          entity_type: 'training_course',
          entity_id: copy.training_course_id,
          before_data: { sourceCourseId: source.training_course_id, sourceTitle: source.title },
          after_data: { title: copy.title, status: copy.status },
          ip_address: context.ipAddress,
          user_agent: context.userAgent,
        },
      });
      return copy;
    });
  },
};

import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { CourseUpload } from './course-material.upload.js';
import type { UpdateCourseDraftBody } from './dto/course.dto.js';

const draftSelect = {
  training_course_id: true,
  title: true,
  description: true,
  content: true,
  status: true,
  updated_at: true,
  training_campaigns: { select: { training_campaign_id: true }, take: 1 },
  training_lessons: {
    orderBy: [{ display_order: 'asc' as const }, { training_lesson_id: 'asc' as const }],
    select: {
      training_lesson_id: true,
      title: true,
      description: true,
      is_required: true,
      training_materials: {
        orderBy: [{ display_order: 'asc' as const }, { training_material_id: 'asc' as const }],
        select: {
          training_material_id: true,
          title: true,
          material_type: true,
          content: true,
          external_url: true,
          file_id: true,
          files: {
            select: {
              file_id: true,
              original_name: true,
              mime_type: true,
              size_bytes: true,
              storage_key: true,
            },
          },
        },
      },
      quizzes: {
        orderBy: [{ created_at: 'asc' as const }, { quiz_id: 'asc' as const }],
        take: 1,
        select: {
          title: true,
          passing_score: true,
          max_attempts: true,
          quiz_questions: {
            orderBy: [{ display_order: 'asc' as const }, { quiz_question_id: 'asc' as const }],
            select: {
              question_text: true,
              question_type: true,
              quiz_options: {
                orderBy: [{ display_order: 'asc' as const }, { quiz_option_id: 'asc' as const }],
                select: { option_text: true, is_correct: true },
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
    take: 1,
    select: {
      title: true,
      passing_score: true,
      max_attempts: true,
      quiz_questions: {
        orderBy: [{ display_order: 'asc' as const }, { quiz_question_id: 'asc' as const }],
        select: {
          question_text: true,
          question_type: true,
          quiz_options: {
            orderBy: [{ display_order: 'asc' as const }, { quiz_option_id: 'asc' as const }],
            select: { option_text: true, is_correct: true },
          },
        },
      },
    },
  },
} satisfies Prisma.training_coursesSelect;

export type CourseDraftRecord = Prisma.training_coursesGetPayload<{ select: typeof draftSelect }>;
type RequestContext = { actorUserId: string; ipAddress: string | null; userAgent: string | null };

async function createQuiz(
  transaction: Prisma.TransactionClient,
  courseId: string,
  lessonId: string | null,
  assessment: NonNullable<UpdateCourseDraftBody['assessment']>,
): Promise<void> {
  await transaction.quizzes.create({
    data: {
      training_course_id: courseId,
      training_lesson_id: lessonId,
      title: assessment.title,
      passing_score: assessment.passingScore,
      max_attempts: assessment.maxAttempts,
      quiz_questions: {
        create: assessment.questions.map((question, questionIndex) => ({
          question_text: question.text,
          question_type: question.type,
          score: 1,
          display_order: questionIndex + 1,
          quiz_options: {
            create: question.options.map((option, optionIndex) => ({
              option_text: option.text,
              is_correct: option.isCorrect,
              display_order: optionIndex + 1,
            })),
          },
        })),
      },
    },
    select: { quiz_id: true },
  });
}

export const courseDraftRepository = {
  find(courseId: string): Promise<CourseDraftRecord | null> {
    return prisma.training_courses.findUnique({
      where: { training_course_id: courseId },
      select: draftSelect,
    });
  },

  update(
    courseId: string,
    input: UpdateCourseDraftBody,
    context: RequestContext,
    uploads: readonly CourseUpload[],
  ) {
    return prisma.$transaction(
      async (transaction) => {
        const before = await transaction.training_courses.findUnique({
          where: { training_course_id: courseId },
          select: draftSelect,
        });
        if (!before) return { kind: 'not_found' as const };
        if (before.status !== 'draft') return { kind: 'not_draft' as const };
        if (before.training_campaigns.length) return { kind: 'in_use' as const };
        if (before.updated_at.toISOString() !== input.expectedUpdatedAt)
          return { kind: 'stale' as const };

        const existingFiles = new Map(
          before.training_lessons.flatMap((lesson) =>
            lesson.training_materials.flatMap((material) =>
              material.files ? [[material.files.file_id, material.files] as const] : [],
            ),
          ),
        );
        const retainedFileIds = new Set(
          input.lessons.flatMap((lesson) =>
            lesson.materials.flatMap((material) =>
              material.existingFileId ? [material.existingFileId] : [],
            ),
          ),
        );
        const retainedMaterials = input.lessons.flatMap((lesson) =>
          lesson.materials.filter(
            (material): material is typeof material & { existingFileId: string } =>
              Boolean(material.existingFileId),
          ),
        );
        if (
          retainedMaterials.some((material) => {
            const file = existingFiles.get(material.existingFileId);
            return (
              !file ||
              !file.mime_type ||
              (material.type === 'video'
                ? !file.mime_type.startsWith('video/')
                : file.mime_type !== 'application/pdf')
            );
          })
        )
          return { kind: 'invalid_file' as const };

        const changed = await transaction.training_courses.updateMany({
          where: {
            training_course_id: courseId,
            status: 'draft',
            updated_at: before.updated_at,
            training_campaigns: { none: {} },
          },
          data: {
            title: input.title,
            description: input.description ?? null,
            content: input.content,
            updated_at: new Date(Math.max(Date.now(), before.updated_at.getTime() + 1)),
          },
        });
        if (!changed.count) return { kind: 'stale' as const };

        const quizIds = (
          await transaction.quizzes.findMany({
            where: { training_course_id: courseId },
            select: { quiz_id: true },
          })
        ).map((quiz) => quiz.quiz_id);
        if (quizIds.length) {
          await transaction.quiz_options.deleteMany({
            where: { quiz_questions: { quiz_id: { in: quizIds } } },
          });
          await transaction.quiz_questions.deleteMany({ where: { quiz_id: { in: quizIds } } });
          await transaction.quizzes.deleteMany({ where: { quiz_id: { in: quizIds } } });
        }
        const lessonIds = before.training_lessons.map((lesson) => lesson.training_lesson_id);
        if (lessonIds.length) {
          await transaction.training_materials.deleteMany({
            where: { training_lesson_id: { in: lessonIds } },
          });
          await transaction.training_lessons.deleteMany({
            where: { training_lesson_id: { in: lessonIds } },
          });
        }

        for (const [lessonIndex, lesson] of input.lessons.entries()) {
          const createdLesson = await transaction.training_lessons.create({
            data: {
              training_course_id: courseId,
              title: lesson.title,
              description: lesson.description ?? null,
              display_order: lessonIndex + 1,
              is_required: lesson.isRequired,
            },
            select: { training_lesson_id: true },
          });
          for (const [materialIndex, material] of lesson.materials.entries()) {
            const upload = uploads.find((item) => item.key === material.uploadKey);
            const file = upload
              ? await transaction.files.create({
                  data: {
                    original_name: upload.originalName,
                    storage_key: upload.storageKey,
                    mime_type: upload.mimeType,
                    size_bytes: upload.sizeBytes,
                    checksum: upload.checksum,
                    uploaded_by_user_id: context.actorUserId,
                  },
                  select: { file_id: true },
                })
              : undefined;
            await transaction.training_materials.create({
              data: {
                training_lesson_id: createdLesson.training_lesson_id,
                title: material.title,
                material_type: material.type,
                content: material.content ?? null,
                external_url: material.externalUrl ?? null,
                file_id: file?.file_id ?? material.existingFileId ?? null,
                display_order: materialIndex + 1,
              },
              select: { training_material_id: true },
            });
          }
          if (lesson.assessment)
            await createQuiz(
              transaction,
              courseId,
              createdLesson.training_lesson_id,
              lesson.assessment,
            );
        }
        if (input.assessment) await createQuiz(transaction, courseId, null, input.assessment);

        const removedFiles = [...existingFiles.values()].filter(
          (file) => !retainedFileIds.has(file.file_id),
        );
        if (removedFiles.length)
          await transaction.files.deleteMany({
            where: { file_id: { in: removedFiles.map((file) => file.file_id) } },
          });

        const course = await transaction.training_courses.findUniqueOrThrow({
          where: { training_course_id: courseId },
          select: draftSelect,
        });
        await transaction.audit_logs.create({
          data: {
            actor_user_id: context.actorUserId,
            module: 'training-awareness',
            action: 'training_course.draft_updated',
            entity_type: 'training_course',
            entity_id: courseId,
            before_data: {
              title: before.title,
              lessonCount: before.training_lessons.length,
            },
            after_data: {
              title: course.title,
              lessonCount: course.training_lessons.length,
              uploadedFileCount: uploads.length,
              removedFileCount: removedFiles.length,
            },
            ip_address: context.ipAddress,
            user_agent: context.userAgent,
          },
        });
        return {
          kind: 'updated' as const,
          course,
          removedStorageKeys: removedFiles.map((file) => file.storage_key),
        };
      },
      { timeout: 30000 },
    );
  },
};

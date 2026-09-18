import { z } from 'zod';
export const withdrawEnrollmentBodySchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

const assessmentOptionSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  isCorrect: z.boolean(),
});

const assessmentQuestionSchema = z
  .object({
    type: z.enum(['single_choice', 'multiple_choice']),
    text: z.string().trim().min(3).max(2000),
    options: z.array(assessmentOptionSchema).min(2).max(6),
  })
  .superRefine((value, context) => {
    const correctAnswers = value.options.filter((option) => option.isCorrect).length;
    const valid = value.type === 'single_choice' ? correctAnswers === 1 : correctAnswers >= 2;
    if (!valid) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message:
          value.type === 'single_choice'
            ? 'Select exactly one correct answer'
            : 'Select at least two correct answers',
      });
    }
  });

export const courseAssessmentSchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    passingScore: z.number().min(0).max(100),
    maxAttempts: z.number().int().min(1).max(10),
    questions: z.array(assessmentQuestionSchema).min(1).max(50),
  })
  .strict();

export const courseMaterialSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    type: z.enum(['text', 'video', 'document', 'link']),
    content: z.string().trim().max(50000).optional(),
    externalUrl: z
      .url()
      .max(2000)
      .refine((v) => {
        try {
          const url = new URL(v);
          return url.protocol === 'https:' && !url.username && !url.password;
        } catch {
          return false;
        }
      }, 'Use an HTTPS URL without credentials')
      .optional(),
    uploadKey: z.uuid().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const valid =
      v.type === 'text'
        ? Boolean(v.content) && !v.externalUrl && !v.uploadKey
        : v.type === 'link'
          ? Boolean(v.externalUrl) && !v.content && !v.uploadKey
          : !v.content && Boolean(v.externalUrl) !== Boolean(v.uploadKey);
    if (!valid)
      ctx.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'Provide exactly one source matching the material type',
      });
  });

export const courseLessonSchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    description: z.string().trim().max(2000).optional(),
    isRequired: z.boolean(),
    materials: z.array(courseMaterialSchema).min(1).max(10),
    assessment: courseAssessmentSchema.optional(),
  })
  .strict();

export const createCourseBodySchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    description: z.string().trim().max(2000).nullable().optional(),
    content: z.string().trim().min(10).max(50000),
    status: z.enum(['draft', 'published']).default('draft'),
    lessons: z.array(courseLessonSchema).min(1).max(50).optional(),
    assessment: z
      .object({
        title: z.string().trim().min(3).max(255),
        passingScore: z.number().min(0).max(100),
        maxAttempts: z.number().int().min(1).max(10),
        questions: z.array(assessmentQuestionSchema).min(1).max(50),
      })
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.lessons && value.status !== 'draft') {
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Create structured courses as drafts; publication is a separate operation',
      });
    }
    const keys =
      value.lessons?.flatMap((lesson) =>
        lesson.materials.flatMap((material) => (material.uploadKey ? [material.uploadKey] : [])),
      ) ?? [];
    const materialCount =
      value.lessons?.reduce((count, lesson) => count + lesson.materials.length, 0) ?? 0;
    const questionCount =
      (value.assessment?.questions.length ?? 0) +
      (value.lessons?.reduce(
        (count, lesson) => count + (lesson.assessment?.questions.length ?? 0),
        0,
      ) ?? 0);
    if (materialCount > 100 || questionCount > 100)
      context.addIssue({
        code: 'custom',
        path: ['lessons'],
        message: 'A course may contain at most 100 materials and 100 assessment questions',
      });
    if (new Set(keys).size !== keys.length || keys.length > 10) {
      context.addIssue({
        code: 'custom',
        path: ['lessons'],
        message: 'Use unique upload keys and at most 10 uploaded files',
      });
    }
    if (value.status === 'published' && !value.assessment) {
      context.addIssue({
        code: 'custom',
        path: ['assessment'],
        message: 'A published course requires a post-training assessment',
      });
    }
  });

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format');

export const assignCourseParamsSchema = z.object({
  courseId: z.string().uuid(),
});

export const assignmentOptionsQuerySchema = z.object({
  userQ: z.string().trim().max(100).default(''),
  departmentQ: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const assignCourseBodySchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    startDate: dateSchema,
    dueDate: dateSchema,
    userIds: z.array(z.string().uuid()).max(200).default([]),
    departmentIds: z.array(z.string().uuid()).max(200).default([]),
    createNewCampaign: z.boolean().default(false),
    changeReason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.userIds.length === 0 && value.departmentIds.length === 0 && !value.changeReason) {
      context.addIssue({
        code: 'custom',
        path: ['userIds'],
        message: 'Select at least one user or department',
      });
    }
    if (value.dueDate < value.startDate) {
      context.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'Due date must be on or after start date',
      });
    }
  });

export type CreateCourseBody = z.infer<typeof createCourseBodySchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
export type AssignCourseParams = z.infer<typeof assignCourseParamsSchema>;
export type AssignCourseBody = z.infer<typeof assignCourseBodySchema>;
export type AssignmentOptionsQuery = z.infer<typeof assignmentOptionsQuerySchema>;

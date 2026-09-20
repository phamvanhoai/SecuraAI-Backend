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

const courseDraftFieldsSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).nullable().optional(),
  content: z.string().trim().min(10).max(50000),
  assessment: z
    .object({
      title: z.string().trim().min(3).max(255),
      passingScore: z.number().min(0).max(100),
      maxAttempts: z.number().int().min(1).max(10),
      questions: z.array(assessmentQuestionSchema).min(1).max(50),
    })
    .optional(),
});

export const createCourseBodySchema = z
  .object({
    ...courseDraftFieldsSchema.shape,
    status: z.enum(['draft', 'published']).default('draft'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'published' && !value.assessment) {
      context.addIssue({
        code: 'custom',
        path: ['assessment'],
        message: 'A published course requires a post-training assessment',
      });
    }
  });

export const updateCourseDraftBodySchema = courseDraftFieldsSchema.strict();

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
export type UpdateCourseDraftBody = z.infer<typeof updateCourseDraftBodySchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
export type AssignCourseParams = z.infer<typeof assignCourseParamsSchema>;
export type AssignCourseBody = z.infer<typeof assignCourseBodySchema>;
export type AssignmentOptionsQuery = z.infer<typeof assignmentOptionsQuerySchema>;

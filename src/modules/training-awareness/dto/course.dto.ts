import { z } from 'zod';
export const withdrawEnrollmentBodySchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

export const createCourseBodySchema = z
  .object({
    title: z.string().trim().min(3).max(255),
    description: z.string().trim().max(2000).nullable().optional(),
    content: z.string().trim().min(10).max(50000),
  })
  .strict();

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
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

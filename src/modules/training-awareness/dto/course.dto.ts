import { z } from 'zod';

export const createCourseBodySchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(2000).nullable().optional(),
  content: z.string().trim().min(10).max(50000),
}).strict();

export const listCoursesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
});

export type CreateCourseBody = z.infer<typeof createCourseBodySchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

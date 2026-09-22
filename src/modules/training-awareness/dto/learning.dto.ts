import { z } from 'zod';

export const learningParamsSchema = z.object({ enrollmentId: z.string().uuid() });
export const learningLessonParamsSchema = learningParamsSchema.extend({
  lessonId: z.string().uuid(),
});
export const learningMaterialParamsSchema = learningParamsSchema.extend({
  materialId: z.string().uuid(),
});
export const learningMaterialProgressSchema = z.object({
  status: z.enum(['in_progress', 'completed']),
});
export const learningListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type LearningListQuery = z.infer<typeof learningListQuerySchema>;

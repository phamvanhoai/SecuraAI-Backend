import { z } from 'zod';

export const duplicateCourseBodySchema = z
  .object({ title: z.string().trim().min(3).max(255) })
  .strict();

export type DuplicateCourseBody = z.infer<typeof duplicateCourseBodySchema>;

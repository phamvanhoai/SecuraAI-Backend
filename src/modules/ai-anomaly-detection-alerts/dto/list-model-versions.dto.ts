import { z } from 'zod';

export const listModelVersionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  modelName: z.string().trim().min(1).max(150).optional(),
  status: z.enum(['development', 'validated', 'deployed', 'retired']).optional(),
});

export type ListModelVersionsQuery = z.infer<typeof listModelVersionsQuerySchema>;

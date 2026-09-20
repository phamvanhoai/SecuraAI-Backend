import { z } from 'zod';

export const myCertificatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(100).default(''),
});

export type MyCertificatesQuery = z.infer<typeof myCertificatesQuerySchema>;

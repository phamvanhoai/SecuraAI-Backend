import { z } from 'zod';

export const servicePageQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
export const listBusinessServicesQuerySchema = servicePageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
export const businessServiceParamsSchema = z.object({ serviceId: z.uuid() }).strict();
export type ServicePageQuery = z.infer<typeof servicePageQuerySchema>;
export type ListBusinessServicesQuery = z.infer<typeof listBusinessServicesQuerySchema>;

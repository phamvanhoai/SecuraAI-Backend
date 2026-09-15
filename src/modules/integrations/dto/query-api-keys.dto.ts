import { z } from 'zod';

export const queryApiKeysSchema = z.object({
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().trim().optional(),
});

export type QueryApiKeysDto = z.infer<typeof queryApiKeysSchema>;

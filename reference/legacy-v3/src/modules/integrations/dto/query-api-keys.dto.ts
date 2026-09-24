import { z } from 'zod';

export const queryApiKeysSchema = z.object({
  isActive: z
    .preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional()),
  search: z.string().trim().optional(),
});

export type QueryApiKeysDto = z.infer<typeof queryApiKeysSchema>;

import { z } from 'zod';
import { createBusinessServiceSchema } from './create-business-service.dto.js';
export const updateBusinessServiceSchema = createBusinessServiceSchema
  .partial()
  .extend({ expectedUpdatedAt: z.iso.datetime({ offset: true }) })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.ownerUserId !== undefined,
    'At least one editable field is required',
  );
export type UpdateBusinessServiceInput = z.infer<typeof updateBusinessServiceSchema>;

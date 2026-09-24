import { z } from 'zod';

export const updateIntegrationStatusEnum = z.enum(['active', 'inactive', 'disabled']);

export const updateIntegrationSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(150, 'Name cannot exceed 150 characters').optional(),
    baseUrl: z.string().trim().url('Invalid URL format').nullable().optional(),
    configuration: z.record(z.string(), z.unknown()).nullable().optional(),
    status: updateIntegrationStatusEnum.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.baseUrl !== undefined ||
      data.configuration !== undefined ||
      data.status !== undefined,
    {
      message: 'At least one field must be provided for update',
    },
  );

export type UpdateIntegrationDto = z.infer<typeof updateIntegrationSchema>;

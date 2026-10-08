import { z } from 'zod';

export const updateNotificationPreferencesSchema = z
  .object({
    channels: z
      .object({
        inSystem: z.boolean(),
        email: z.boolean(),
      })
      .strict()
      .refine((channels) => channels.inSystem || channels.email, {
        message: 'At least one notification channel must be enabled',
      }),
  })
  .strict();

export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesSchema
>;

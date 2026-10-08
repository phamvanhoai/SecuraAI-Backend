import { z } from 'zod';

const normalizedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(
      (value) =>
        Array.from(value).every((character) => {
          const code = character.charCodeAt(0);
          return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
        }),
      { message: 'Control characters are not allowed' },
    );

const roleAudienceSchema = z
  .object({
    type: z.literal('roles'),
    roles: z.array(z.enum(['ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE', 'EMPLOYEE'])).min(1).max(4),
  })
  .strict()
  .transform((audience) => ({ ...audience, roles: [...new Set(audience.roles)] }));

const userAudienceSchema = z
  .object({
    type: z.literal('users'),
    userIds: z.array(z.uuid()).min(1).max(200),
  })
  .strict()
  .transform((audience) => ({ ...audience, userIds: [...new Set(audience.userIds)] }));

export const sendInSystemNotificationSchema = z
  .object({
    title: normalizedText(160),
    message: normalizedText(2000),
    priority: z.enum(['NORMAL', 'IMPORTANT', 'URGENT']),
    audience: z.discriminatedUnion('type', [roleAudienceSchema, userAudienceSchema]),
  })
  .strict();

export type SendInSystemNotificationInput = z.infer<typeof sendInSystemNotificationSchema>;

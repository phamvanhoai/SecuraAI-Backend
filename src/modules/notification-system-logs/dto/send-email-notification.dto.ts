import { z } from 'zod';

const safeText = (maximum: number) =>
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

const safeSubject = safeText(160).refine((value) => !/[\r\n]/u.test(value), {
  message: 'Line breaks are not allowed in the subject',
});

export const sendEmailNotificationSchema = z
  .object({
    subject: safeSubject,
    message: safeText(4000),
    userIds: z
      .array(z.uuid())
      .min(1)
      .max(20)
      .transform((userIds) => [...new Set(userIds)]),
  })
  .strict();

export type SendEmailNotificationInput = z.infer<typeof sendEmailNotificationSchema>;

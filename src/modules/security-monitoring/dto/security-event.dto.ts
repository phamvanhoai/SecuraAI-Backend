import { z } from 'zod';

const jsonObjectSchema = z.record(z.string(), z.json());

export const ingestSecurityEventsBodySchema = z
  .object({
    events: z.array(jsonObjectSchema).min(1).max(100),
  })
  .strict();

export type IngestSecurityEventsBody = z.infer<typeof ingestSecurityEventsBodySchema>;

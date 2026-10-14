import { z } from 'zod';

export const assignIncidentHandlerSchema = z
  .object({
    assigneeUserId: z.uuid(),
    note: z.string().trim().min(10).max(2000),
    expectedUpdatedAt: z.iso.datetime().optional(),
  })
  .strict();

export type AssignIncidentHandler = z.infer<typeof assignIncidentHandlerSchema>;

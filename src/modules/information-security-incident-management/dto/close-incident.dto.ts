import { z } from 'zod';

export const closeIncidentSchema = z
  .object({
    summary: z.string().trim().min(20).max(4000),
    confirmed: z.literal(true),
    expectedUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type CloseIncident = z.infer<typeof closeIncidentSchema>;
export const closureSnapshotSchema = z.object({ summary: z.string(), confirmed: z.literal(true) });

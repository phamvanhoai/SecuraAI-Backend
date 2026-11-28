import { z } from 'zod';

const findingText = z.string().trim().min(20).max(4000);
// Validate request data for save incident analysis.
export const saveIncidentAnalysisSchema = z
  .object({
    rootCause: findingText,
    lessonsLearned: findingText,
    improvementActions: findingText,
    expectedUpdatedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type SaveIncidentAnalysis = z.infer<typeof saveIncidentAnalysisSchema>;
// Validate request data for analysis history query.
export const analysisHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
// Validate stored audit data for analysis snapshot.
export const analysisSnapshotSchema = z.object({
  rootCause: z.string().nullable(),
  lessonsLearned: z.string().nullable(),
  improvementActions: z.string().nullable(),
});

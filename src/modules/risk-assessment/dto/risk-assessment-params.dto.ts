import { z } from 'zod';

export const riskAssessmentParamsSchema = z.object({
  riskAssessmentId: z.uuid(),
});

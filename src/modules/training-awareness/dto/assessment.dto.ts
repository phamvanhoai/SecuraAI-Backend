import { z } from 'zod';

export const listMyAssessmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const assessmentParamsSchema = z.object({
  enrollmentId: z.string().uuid(),
});

export const submitAssessmentBodySchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            questionId: z.string().uuid(),
            optionIds: z.array(z.string().uuid()).min(1).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.answers.map((answer) => answer.questionId)).size !== value.answers.length) {
      context.addIssue({ code: 'custom', path: ['answers'], message: 'Answer each question once' });
    }
    value.answers.forEach((answer, index) => {
      if (new Set(answer.optionIds).size !== answer.optionIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['answers', index, 'optionIds'],
          message: 'Select each option once',
        });
      }
    });
  });

export type ListMyAssessmentsQuery = z.infer<typeof listMyAssessmentsQuerySchema>;
export type SubmitAssessmentBody = z.infer<typeof submitAssessmentBodySchema>;

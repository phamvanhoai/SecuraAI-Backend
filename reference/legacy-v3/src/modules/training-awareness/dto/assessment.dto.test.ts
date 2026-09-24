import { describe, expect, it } from 'vitest';
import { submitAssessmentBodySchema } from './assessment.dto.js';

describe('submitAssessmentBodySchema', () => {
  it('accepts one selected option per question', () => {
    expect(
      submitAssessmentBodySchema.safeParse({
        answers: [
          {
            questionId: '5ba7b932-11ed-4bb4-a813-1ba9e34a2f95',
            optionIds: ['e52400f2-87d5-456e-8efd-6e4d833068be'],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate question answers', () => {
    const questionId = '5ba7b932-11ed-4bb4-a813-1ba9e34a2f95';
    expect(
      submitAssessmentBodySchema.safeParse({
        answers: [
          { questionId, optionIds: ['e52400f2-87d5-456e-8efd-6e4d833068be'] },
          { questionId, optionIds: ['24f39a3b-cd16-498e-82db-c95485844910'] },
        ],
      }).success,
    ).toBe(false);
  });
});

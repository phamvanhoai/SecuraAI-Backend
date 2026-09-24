import { describe, expect, it } from 'vitest';
import { performResidualRiskAssessmentBodySchema } from '../src/modules/risk-management/dto/perform-residual-risk-assessment.dto.js';

const expectedUpdatedAt = '2026-09-22T08:00:00.000Z';

describe('perform residual risk assessment DTO', () => {
  it('accepts likelihood and impact boundaries and trims the note', () => {
    expect(
      performResidualRiskAssessmentBodySchema.parse({
        residualLikelihood: 1,
        residualImpact: 5,
        assessmentNote: '  Treatment controls were tested successfully.  ',
        expectedUpdatedAt,
      }),
    ).toMatchObject({
      residualLikelihood: 1,
      residualImpact: 5,
      assessmentNote: 'Treatment controls were tested successfully.',
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
  });

  it.each([0, 1.5, 6])('rejects invalid likelihood %s', (residualLikelihood) => {
    expect(() =>
      performResidualRiskAssessmentBodySchema.parse({
        residualLikelihood,
        residualImpact: 2,
        assessmentNote: 'Treatment controls were tested successfully.',
        expectedUpdatedAt,
      }),
    ).toThrow();
  });

  it('rejects short notes and server-derived fields', () => {
    expect(() =>
      performResidualRiskAssessmentBodySchema.parse({
        residualLikelihood: 2,
        residualImpact: 2,
        assessmentNote: 'short',
        expectedUpdatedAt,
      }),
    ).toThrow();
    expect(() =>
      performResidualRiskAssessmentBodySchema.parse({
        residualLikelihood: 2,
        residualImpact: 2,
        residualScore: 4,
        assessmentNote: 'Treatment controls were tested successfully.',
        expectedUpdatedAt,
      }),
    ).toThrow();
  });
});

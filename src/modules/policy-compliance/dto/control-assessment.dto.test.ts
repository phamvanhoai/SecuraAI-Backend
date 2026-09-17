import { describe, expect, it } from 'vitest';
import { createControlAssessmentBodySchema, listControlAssessmentsQuerySchema } from './control-assessment.dto.js';

describe('control assessment DTOs', () => {
  it('bounds pagination and score', () => {
    expect(listControlAssessmentsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(() => createControlAssessmentBodySchema.parse({ complianceStatus: 'compliant', score: 101 })).toThrow();
  });
  it('accepts a valid assessment', () => {
    expect(createControlAssessmentBodySchema.parse({ complianceStatus: 'partially_compliant', score: 72.5 }).score).toBe(72.5);
  });
  it('enforces status and score consistency', () => {
    expect(() => createControlAssessmentBodySchema.parse({ complianceStatus: 'compliant', score: 79 })).toThrow();
    expect(() => createControlAssessmentBodySchema.parse({ complianceStatus: 'not_assessed', score: 0 })).toThrow();
    expect(createControlAssessmentBodySchema.parse({ complianceStatus: 'non_compliant', score: 39.99 }).score).toBe(39.99);
  });
});

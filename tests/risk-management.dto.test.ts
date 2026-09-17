import { describe, expect, it } from 'vitest';
import { listRiskAssessmentsQuerySchema } from '../src/modules/risk-management/dto/list-risk-assessments-query.dto.js';
import { riskAssessmentParamsSchema } from '../src/modules/risk-management/dto/risk-assessment-params.dto.js';
import { createRiskAssessmentBodySchema } from '../src/modules/risk-management/dto/create-risk-assessment.dto.js';
import { updateRiskAssessmentBodySchema } from '../src/modules/risk-management/dto/update-risk-assessment.dto.js';
import { cancelRiskAssessmentBodySchema } from '../src/modules/risk-management/dto/cancel-risk-assessment.dto.js';

describe('listRiskAssessmentsQuerySchema', () => {
  it('applies bounded pagination and stable sort defaults', () => {
    expect(listRiskAssessmentsQuerySchema.parse({})).toMatchObject({
      page: 1,
      limit: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  });

  it('coerces treatment plan filtering', () => {
    expect(
      listRiskAssessmentsQuerySchema.parse({ hasTreatmentPlan: 'false' }).hasTreatmentPlan,
    ).toBe(false);
  });

  it('rejects an inverted assessment date range', () => {
    expect(() =>
      listRiskAssessmentsQuerySchema.parse({
        assessedFrom: '2026-09-15',
        assessedTo: '2026-09-01',
      }),
    ).toThrow();
  });
});

describe('createRiskAssessmentBodySchema', () => {
  const assetId = '4e3bf41b-32fb-4461-9740-9c2e68a6ff84';
  const threatId = '11111111-1111-4111-8111-111111111111';
  const vulnerabilityId = '22222222-2222-4222-8222-222222222222';
  it('requires exactly one target and rejects server-owned fields', () => {
    expect(() =>
      createRiskAssessmentBodySchema.parse({ title: 'Valid risk', likelihood: 3, impact: 4 }),
    ).toThrow();
    expect(() =>
      createRiskAssessmentBodySchema.parse({
        assetId,
        title: 'Valid risk',
        likelihood: 3,
        impact: 4,
        status: 'approved',
      }),
    ).toThrow();
  });
  it('rejects duplicate linked items', () => {
    expect(() =>
      createRiskAssessmentBodySchema.parse({
        assetId,
        title: 'Valid risk',
        likelihood: 3,
        impact: 4,
        threats: [{ threatId: assetId }, { threatId: assetId }],
      }),
    ).toThrow();
  });
  it('requires catalog links and accepts a valid draft', () => {
    expect(() =>
      createRiskAssessmentBodySchema.parse({
        assetId,
        title: 'Valid risk',
        likelihood: 3,
        impact: 4,
        threats: [],
        vulnerabilities: [],
      }),
    ).toThrow();
    expect(
      createRiskAssessmentBodySchema.parse({
        assetId,
        title: 'Valid risk',
        likelihood: 3,
        impact: 4,
        threats: [{ threatId }],
        vulnerabilities: [{ vulnerabilityId }],
      }),
    ).toMatchObject({ threats: [{ threatId }], vulnerabilities: [{ vulnerabilityId }] });
  });
});

describe('updateRiskAssessmentBodySchema', () => {
  const assetId = '4e3bf41b-32fb-4461-9740-9c2e68a6ff84';
  const valid = {
    assetId,
    title: 'Updated risk',
    likelihood: 2,
    impact: 5,
    threats: [{ threatId: '11111111-1111-4111-8111-111111111111' }],
    vulnerabilities: [{ vulnerabilityId: '22222222-2222-4222-8222-222222222222' }],
    expectedUpdatedAt: '2026-09-15T10:00:00.000Z',
  };
  it('requires optimistic concurrency data', () => {
    const withoutVersion = {
      assetId: valid.assetId,
      title: valid.title,
      likelihood: valid.likelihood,
      impact: valid.impact,
      threats: valid.threats,
      vulnerabilities: valid.vulnerabilities,
    };
    expect(() => updateRiskAssessmentBodySchema.parse(withoutVersion)).toThrow();
  });
  it('rejects server-owned fields', () => {
    expect(() => updateRiskAssessmentBodySchema.parse({ ...valid, status: 'approved' })).toThrow();
  });
  it('accepts a valid draft update', () => {
    expect(updateRiskAssessmentBodySchema.parse(valid).expectedUpdatedAt).toBe(
      valid.expectedUpdatedAt,
    );
  });
});

describe('riskAssessmentParamsSchema', () => {
  it('accepts a UUID and rejects an unsafe identifier', () => {
    expect(
      riskAssessmentParamsSchema.parse({
        riskAssessmentId: '4e3bf41b-32fb-4461-9740-9c2e68a6ff84',
      }),
    ).toBeTruthy();
    expect(() => riskAssessmentParamsSchema.parse({ riskAssessmentId: '../risks' })).toThrow();
  });
});

describe('cancelRiskAssessmentBodySchema', () => {
  it('accepts a meaningful reason and concurrency timestamp', () => {
    expect(
      cancelRiskAssessmentBodySchema.parse({
        reason: 'The assessment is no longer required.',
        expectedUpdatedAt: '2026-09-15T10:00:00.000Z',
      }).reason,
    ).toBe('The assessment is no longer required.');
  });

  it('rejects a short reason and server-owned fields', () => {
    expect(() =>
      cancelRiskAssessmentBodySchema.parse({
        reason: 'Too short',
        expectedUpdatedAt: '2026-09-15T10:00:00.000Z',
      }),
    ).toThrow();
    expect(() =>
      cancelRiskAssessmentBodySchema.parse({
        reason: 'The assessment is no longer required.',
        expectedUpdatedAt: '2026-09-15T10:00:00.000Z',
        status: 'cancelled',
      }),
    ).toThrow();
  });

  it('normalizes whitespace before enforcing the minimum reason length', () => {
    expect(
      cancelRiskAssessmentBodySchema.parse({
        reason: '  Created\n   by mistake and no longer required.  ',
        expectedUpdatedAt: '2026-09-15T10:00:00.000Z',
      }).reason,
    ).toBe('Created by mistake and no longer required.');
    expect(() =>
      cancelRiskAssessmentBodySchema.parse({
        reason: 'a         b',
        expectedUpdatedAt: '2026-09-15T10:00:00.000Z',
      }),
    ).toThrow();
  });
});

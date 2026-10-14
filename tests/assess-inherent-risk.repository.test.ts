import { beforeEach, describe, expect, it, vi } from 'vitest';

const assessedAt = new Date('2026-10-13T02:00:00.000Z');
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  risks: { findUnique: vi.fn() },
  risk_assessments: { create: vi.fn() },
}));

vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (operation: (database: typeof db) => Promise<unknown>) => operation(db),
  },
}));

import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';

const input = {
  likelihood: 3,
  impact: 4,
  assessmentReason: 'Plausible outage with major recovery impact.',
};
const risk = {
  id: '22222222-2222-4222-8222-222222222222',
  risk_code: 'RSK-001',
  title: 'Database outage',
  status: 'OPEN',
  review_date: null,
  risk_assessments: [] as {
    id: string;
    inherent_rating: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    assessment_reason: string | null;
  }[],
  _count: { risk_assets: 1, risk_threats: 1, risk_vulnerabilities: 1 },
};

describe('assess inherent risk repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$queryRaw.mockResolvedValue([{ time: assessedAt }]);
    db.risks.findUnique.mockResolvedValue(risk);
    db.risk_assessments.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'assessment-id',
        assessment_type: data.assessment_type,
        methodology_version: data.methodology_version,
        assessed_at: assessedAt,
      }),
    );
  });

  it('records the first assessment as initial with its methodology version', async () => {
    const result = await riskRegisterRepository.assessInherentRisk(risk.id, 'actor-id', input);
    expect(result.kind).toBe('created');
    expect(db.risk_assessments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assessment_type: 'INITIAL',
          methodology_version: 'SECURAAI-RISK-MATRIX-v1',
        }),
      }),
    );
  });

  it('records a later direct assessment as a periodic review', async () => {
    db.risks.findUnique.mockResolvedValue({
      ...risk,
      risk_assessments: [
        { id: 'prior', inherent_rating: 'MEDIUM', assessment_reason: 'Previous basis' },
      ],
    });
    await riskRegisterRepository.assessInherentRisk(risk.id, 'actor-id', input);
    expect(db.risk_assessments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assessment_type: 'PERIODIC_REVIEW' }),
      }),
    );
  });

  it('requires a detailed new reason when the rating drops by two or more levels', async () => {
    db.risks.findUnique.mockResolvedValue({
      ...risk,
      risk_assessments: [
        { id: 'prior', inherent_rating: 'HIGH', assessment_reason: 'Previous high-risk basis' },
      ],
    });

    await expect(
      riskRegisterRepository.assessInherentRisk(risk.id, 'actor-id', {
        likelihood: 1,
        impact: 2,
        assessmentReason: 'Too short',
      }),
    ).resolves.toEqual({ kind: 'major_change_reason_required' });
    expect(db.risk_assessments.create).not.toHaveBeenCalled();
  });

  it('rejects reuse of the previous reason for a major rating reduction', async () => {
    const previousReason = 'The former basis is long enough but must not be reused verbatim.';
    db.risks.findUnique.mockResolvedValue({
      ...risk,
      risk_assessments: [
        { id: 'prior', inherent_rating: 'CRITICAL', assessment_reason: previousReason },
      ],
    });

    await expect(
      riskRegisterRepository.assessInherentRisk(risk.id, 'actor-id', {
        likelihood: 1,
        impact: 3,
        assessmentReason: previousReason,
      }),
    ).resolves.toEqual({ kind: 'major_change_reason_unchanged' });
    expect(db.risk_assessments.create).not.toHaveBeenCalled();
  });

  it.each(['ACCEPTED', 'CLOSED', 'ARCHIVED'])(
    'blocks assessment while Risk is %s',
    async (status) => {
      db.risks.findUnique.mockResolvedValue({ ...risk, status });
      await expect(
        riskRegisterRepository.assessInherentRisk(risk.id, 'actor-id', input),
      ).resolves.toEqual({
        kind: 'context_locked',
      });
      expect(db.risk_assessments.create).not.toHaveBeenCalled();
    },
  );
});

import { beforeEach, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(), users: { findUnique: vi.fn() }, risks: { findUnique: vi.fn(), update: vi.fn() },
  risk_assessments: { findFirst: vi.fn() }, audit_logs: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: { $transaction: (work: (tx: typeof db) => Promise<unknown>) => work(db) } }));
import { riskRegisterRepository } from '../src/modules/risk-assessment/risk-register.repository.js';
import { reviewDeadline, vietnamDate } from '../src/modules/risk-assessment/review-schedule.js';
const opened = new Date('2026-10-25T00:00:00Z');
const assessed = new Date('2026-10-26T00:00:00Z');
const now = new Date('2026-10-27T10:00:00Z');
const input = { conclusion: 'Reviewed current context and controls.', nextReviewDate: '2027-01-27', expectedUpdatedAt: opened.toISOString(), expectedOpenedAt: opened.toISOString(), assessmentId: 'assessment' };
const risk = () => ({ id: 'risk', owner_user_id: 'owner', status: 'OPEN', updated_at: opened, review_date: new Date('2026-10-16T00:00:00Z'), risk_acceptances: [],
  risk_threats: [], risk_vulnerabilities: [], risk_assets: [{ assets: { id: 'asset', classified_at: null } }],
  risk_assessments: [{ id: 'assessment', assessed_at: assessed, residual_rating: 'HIGH' }],
  control_risk_links: [{ security_controls: { applicability: 'APPLICABLE', implementation_status: 'IMPLEMENTED', updated_at: opened,
    control_assessments: [{ assessed_at: opened, effectiveness: new Prisma.Decimal(80) }],
    control_evidence_links: [{ linked_at: opened, evidence_items: { status: 'ACTIVE', collected_at: opened, valid_from: null, valid_until: null } }],
  } }],
});
beforeEach(() => {
  vi.resetAllMocks(); db.$queryRaw.mockResolvedValue([{ time: now }]);
  db.users.findUnique.mockResolvedValue({ status: 'ACTIVE', full_name: 'Owner' });
  db.risks.findUnique.mockResolvedValue(risk());
  db.risk_assessments.findFirst.mockResolvedValue({ assessed_at: opened });
  db.audit_logs.findMany.mockResolvedValue([{ action: 'RISK_REVIEW_OPENED', occurred_at: opened, after_data: { openedBy: 'owner', openedByName: 'Owner', previousReviewDate: '2026-10-16T00:00:00Z' } }]);
  db.audit_logs.findFirst.mockResolvedValue(null);
});
it('completes atomically without changing status or old assessments', async () => {
  await expect(riskRegisterRepository.completeReview('risk', 'owner', input)).resolves.toMatchObject({ nextReviewDate: '2027-01-27' });
  expect(db.risks.update).toHaveBeenCalledWith({ where: { id: 'risk' }, data: { review_date: new Date('2027-01-27T00:00:00Z'), updated_at: now } });
  expect(db.audit_logs.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'RISK_REVIEW_COMPLETED', after_data: expect.objectContaining({ assessmentId: 'assessment', residualRating: 'high', completedBy: 'owner' }) }) }));
});
it.each(['2026-10-27', '2026-10-26', '2027-01-28'])('rejects invalid next date %s', async (nextReviewDate) => {
  await expect(riskRegisterRepository.completeReview('risk', 'owner', { ...input, nextReviewDate })).rejects.toMatchObject({ statusCode: 422 });
  expect(db.risks.update).not.toHaveBeenCalled();
});
it('allows an earlier future deadline', async () => {
  await expect(riskRegisterRepository.completeReview('risk', 'owner', { ...input, nextReviewDate: '2026-11-01' })).resolves.toMatchObject({ nextReviewDate: '2026-11-01' });
});
it('checks current ownership', async () => {
  await expect(riskRegisterRepository.completeReview('risk', 'other', input)).rejects.toMatchObject({ statusCode: 403 });
});
it('rejects old residual and already-completed review', async () => {
  db.risks.findUnique.mockResolvedValueOnce({ ...risk(), risk_assessments: [{ id: 'assessment', assessed_at: opened, residual_rating: 'HIGH' }] });
  await expect(riskRegisterRepository.completeReview('risk', 'owner', input)).rejects.toMatchObject({ code: 'RISK_REASSESSMENT_REQUIRED' });
  db.audit_logs.findMany.mockResolvedValueOnce([]);
  await expect(riskRegisterRepository.completeReview('risk', 'owner', input)).rejects.toMatchObject({ code: 'RISK_REVIEW_CHANGED' });
});
it('rejects stale revision, pending acceptance and expired Evidence', async () => {
  await expect(riskRegisterRepository.completeReview('risk', 'owner', { ...input, expectedUpdatedAt: now.toISOString() })).rejects.toMatchObject({ statusCode: 409 });
  db.risks.findUnique.mockResolvedValueOnce({ ...risk(), risk_acceptances: [{ id: 'pending' }] });
  await expect(riskRegisterRepository.completeReview('risk', 'owner', input)).rejects.toMatchObject({ code: 'RISK_CONTEXT_LOCKED' });
  db.risks.findUnique.mockResolvedValueOnce({ ...risk(), control_risk_links: [] });
  await expect(riskRegisterRepository.completeReview('risk', 'owner', input)).rejects.toMatchObject({ code: 'CONTROL_REASSESSMENT_REQUIRED' });
});
it('does not report success when audit storage fails', async () => {
  db.audit_logs.create.mockRejectedValue(new Error('audit failed'));
  await expect(riskRegisterRepository.completeReview('risk', 'owner', input)).rejects.toThrow('audit failed');
});
it('clamps calendar months and uses Vietnam midnight', () => {
  expect(reviewDeadline('2026-01-31', 'CRITICAL')).toBe('2026-02-28');
  expect(reviewDeadline('2028-01-31', 'CRITICAL')).toBe('2028-02-29');
  expect(reviewDeadline('2028-02-29', 'LOW')).toBe('2029-02-28');
  expect(vietnamDate(new Date('2026-10-27T17:00:00Z'))).toBe('2026-10-28');
});

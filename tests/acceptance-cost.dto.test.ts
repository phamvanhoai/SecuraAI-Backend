import { describe, expect, it } from 'vitest';
import { createTreatmentPlanBodySchema as create } from '../src/modules/risk-assessment/dto/create-treatment-plan.dto.js';
import { updateTreatmentPlanBodySchema as update } from '../src/modules/risk-assessment/dto/update-treatment-plan.dto.js';

const id = '11111111-1111-4111-8111-111111111111';
const cost = { costToFix: '100000000', expectedLoss: '5000000', currency: 'VND' as const, periodMonths: 12, basis: 'Synthetic demo: total remediation and expected loss over twelve months.' };
const base = { riskId: id, title: 'Accept demo exposure', strategy: 'accept' as const, ownerUserId: id, targetDate: '2027-12-31', targetRisk: 'low' as const, controlIds: [], actions: [] };
describe('Accept treatment costs', () => {
  it('requires costs for a new Accept plan', () => {
    expect(create.safeParse(base).success).toBe(false);
    expect(create.safeParse({ ...base, acceptanceCost: cost }).success).toBe(true);
  });
  it.each(['mitigate', 'avoid', 'transfer'])('preserves %s actions and rejects acceptance-only costs', (strategy) => {
    const input = { ...base, strategy, controlIds: [id], actions: [{ title: 'Perform treatment', assignedToUserId: id, dueDate: '2027-10-01' }] };
    expect(create.safeParse(input).success).toBe(true);
    expect(create.safeParse({ ...input, actions: [] }).success).toBe(false);
    expect(create.safeParse({ ...input, acceptanceCost: cost }).success).toBe(false);
  });
  it.each(['', '-1', 'NaN', 'Infinity', '1e5', '1,000', '01', '1000000000000', '0.001'])('rejects invalid amount %j', (amount) => {
    for (const field of ['costToFix', 'expectedLoss']) expect(create.safeParse({ ...base, acceptanceCost: { ...cost, [field]: amount } }).success).toBe(false);
  });
  it('preserves decimal strings and accepts zero without interpreting it as missing', () => {
    expect(create.parse({ ...base, acceptanceCost: { ...cost, currency: 'USD', costToFix: '999999999999.99', expectedLoss: '0' } }).acceptanceCost?.costToFix).toBe('999999999999.99');
  });
  it('rejects fractions of VND, invalid currency and incomplete assumptions', () => {
    for (const patch of [{ expectedLoss: '0.50' }, { currency: 'ABC' }, { periodMonths: 0 }, { periodMonths: 121 }, { periodMonths: 1.5 }, { basis: 'short' }]) expect(create.safeParse({ ...base, acceptanceCost: { ...cost, ...patch } }).success).toBe(false);
  });
  it('does not create a fake no-op action', () => {
    expect(create.safeParse({ ...base, acceptanceCost: cost, actions: [{ title: 'Do nothing', assignedToUserId: id, dueDate: '2027-10-01' }] }).success).toBe(false);
  });
  it('requires costs on update, but permits cancelling legacy plans without them', () => {
    const input = { title: base.title, strategy: base.strategy, ownerUserId: id, targetDate: base.targetDate, status: 'active', controlIds: [], actions: [], expectedUpdatedAt: '2026-10-19T00:00:00Z' };
    expect(update.safeParse(input).success).toBe(false);
    expect(update.safeParse({ ...input, acceptanceCost: cost }).success).toBe(true);
    expect(update.safeParse({ ...input, status: 'cancelled' }).success).toBe(true);
    const action = { id, title: 'Old work', assignedToUserId: id, dueDate: '2027-10-01', status: 'cancelled' };
    expect(update.safeParse({ ...input, acceptanceCost: cost, actions: [action] }).success).toBe(true);
    expect(update.safeParse({ ...input, acceptanceCost: cost, actions: [{ ...action, status: 'pending' }] }).success).toBe(false);
  });
});

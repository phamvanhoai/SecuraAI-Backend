import { describe, expect, it } from 'vitest';
import { reminderId, reminderMilestone } from './training-reminder-policy.js';

describe('training deadline policy', () => {
  const due = new Date('2026-09-30T00:00:00Z');
  it.each([
    ['2026-09-26T12:00:00Z', null],
    ['2026-09-27T00:00:00Z', 3],
    ['2026-09-28T23:59:59Z', 3],
    ['2026-09-29T00:00:00Z', 1],
    ['2026-09-30T23:59:59Z', 1],
    ['2026-10-01T00:00:00Z', null],
  ])('uses UTC calendar windows at %s', (now, expected) => {
    expect(reminderMilestone(due, new Date(now))).toBe(expected);
  });
  it('uses the database-compatible deterministic key and changes on deadline/recipient/milestone', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const key = reminderId(id, due, 3);
    expect(key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(reminderId(id, due, 3)).toBe(key);
    expect(reminderId(id, due, 1)).not.toBe(key);
    expect(reminderId(id, new Date('2026-10-01T00:00:00Z'), 3)).not.toBe(key);
    expect(reminderId('00000000-0000-4000-8000-000000000002', due, 3)).not.toBe(key);
  });
});

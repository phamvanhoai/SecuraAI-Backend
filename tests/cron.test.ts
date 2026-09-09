import { describe, it, expect } from 'vitest';
import {
  isValidCronExpression,
  getNextCronRunDate,
} from '../src/common/utils/cron.js';

describe('Cron Utility (UTC)', () => {
  it('validates and parses standard 5-field cron expressions', () => {
    expect(isValidCronExpression('*/15 * * * *')).toBe(true);
    expect(isValidCronExpression('0 * * * *')).toBe(true);
    expect(isValidCronExpression('0 2 * * *')).toBe(true);
    expect(isValidCronExpression('30 4 1,15 * *')).toBe(true);
    expect(isValidCronExpression('0 0 * * 1-5')).toBe(true);
  });

  it('validates supported aliases', () => {
    expect(isValidCronExpression('@hourly')).toBe(true);
    expect(isValidCronExpression('@daily')).toBe(true);
    expect(isValidCronExpression('@midnight')).toBe(true);
    expect(isValidCronExpression('@weekly')).toBe(true);
    expect(isValidCronExpression('@monthly')).toBe(true);
    expect(isValidCronExpression('@yearly')).toBe(true);
  });

  it('rejects invalid cron expressions', () => {
    expect(isValidCronExpression('')).toBe(false);
    expect(isValidCronExpression('* * *')).toBe(false); // 3 fields
    expect(isValidCronExpression('* * * * * *')).toBe(false); // 6 fields
    expect(isValidCronExpression('60 * * * *')).toBe(false); // minute > 59
    expect(isValidCronExpression('* 25 * * *')).toBe(false); // hour > 23
    expect(isValidCronExpression('* * 32 * *')).toBe(false); // dom > 31
    expect(isValidCronExpression('* * * 13 *')).toBe(false); // month > 12
    expect(isValidCronExpression('* * * * 8')).toBe(false); // dow > 7
    expect(isValidCronExpression('invalid-string')).toBe(false);
  });

  it('calculates next run date in UTC for @hourly', () => {
    const baseDate = new Date('2026-09-09T10:15:30.000Z');
    const nextRun = getNextCronRunDate('@hourly', baseDate);

    expect(nextRun.toISOString()).toBe('2026-09-09T11:00:00.000Z');
  });

  it('calculates next run date in UTC for */15 * * * *', () => {
    const baseDate = new Date('2026-09-09T10:15:00.000Z');
    const nextRun = getNextCronRunDate('*/15 * * * *', baseDate);

    expect(nextRun.toISOString()).toBe('2026-09-09T10:30:00.000Z');
  });

  it('calculates next run date in UTC for @daily (0 0 * * *)', () => {
    const baseDate = new Date('2026-09-09T10:15:00.000Z');
    const nextRun = getNextCronRunDate('@daily', baseDate);

    expect(nextRun.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('calculates next run date across month boundaries', () => {
    const baseDate = new Date('2026-09-30T23:45:00.000Z');
    const nextRun = getNextCronRunDate('0 2 1 * *', baseDate);

    expect(nextRun.toISOString()).toBe('2026-10-01T02:00:00.000Z');
  });

  it('handles day of week constraints (e.g. 0 0 * * 1 for Monday)', () => {
    // 2026-09-09 is Wednesday (dow = 3)
    const baseDate = new Date('2026-09-09T12:00:00.000Z');
    const nextRun = getNextCronRunDate('0 0 * * 1', baseDate);

    // Next Monday is 2026-09-14
    expect(nextRun.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(nextRun.getUTCDay()).toBe(1);
  });

  it('throws error when no occurrence exists within bounded 5-year search', () => {
    // Impossible date: 30th of February
    expect(() => {
      getNextCronRunDate('0 0 30 2 *', new Date('2026-01-01T00:00:00.000Z'));
    }).toThrowError(/No valid future occurrence found within 5 years/);
  });
});

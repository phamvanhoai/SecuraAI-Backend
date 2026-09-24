import { describe, expect, it } from 'vitest';
import { confirmAlertBodySchema } from '../src/modules/ai-alerts/dto/confirm-alert.dto.js';

describe('confirm AI alert DTO', () => {
  it('accepts an empty body and trims an optional comment', () => {
    expect(confirmAlertBodySchema.parse({})).toEqual({});
    expect(confirmAlertBodySchema.parse({ comment: '  verified  ' })).toEqual({ comment: 'verified' });
  });

  it('rejects blank, oversized and unknown values', () => {
    expect(confirmAlertBodySchema.safeParse({ comment: ' ' }).success).toBe(false);
    expect(confirmAlertBodySchema.safeParse({ comment: 'x'.repeat(2001) }).success).toBe(false);
    expect(confirmAlertBodySchema.safeParse({ unknown: true }).success).toBe(false);
  });
});

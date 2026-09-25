import { describe, expect, it } from 'vitest';
import { markAiAlertFalsePositiveSchema } from '../src/modules/ai-anomaly-detection-alerts/dto/mark-ai-alert-false-positive.dto.js';

describe('mark AI alert false positive DTO', () => {
  it('accepts an optional trimmed comment', () => {
    expect(markAiAlertFalsePositiveSchema.parse({ comment: '  Expected scanner  ' })).toEqual({
      comment: 'Expected scanner',
    });
    expect(markAiAlertFalsePositiveSchema.parse({})).toEqual({});
  });

  it('rejects oversized comments and unknown fields', () => {
    expect(() => markAiAlertFalsePositiveSchema.parse({ comment: 'x'.repeat(2001) })).toThrow();
    expect(() => markAiAlertFalsePositiveSchema.parse({ force: true })).toThrow();
  });
});

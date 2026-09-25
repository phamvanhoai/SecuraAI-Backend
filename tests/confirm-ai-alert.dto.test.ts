import { describe, expect, it } from 'vitest';
import { confirmAiAlertSchema } from '../src/modules/ai-anomaly-detection-alerts/dto/confirm-ai-alert.dto.js';

describe('confirm AI alert DTO', () => {
  it('accepts an optional trimmed comment', () => {
    expect(confirmAiAlertSchema.parse({ comment: '  Verified activity  ' })).toEqual({
      comment: 'Verified activity',
    });
    expect(confirmAiAlertSchema.parse({})).toEqual({});
  });

  it('rejects oversized comments and unknown fields', () => {
    expect(() => confirmAiAlertSchema.parse({ comment: 'x'.repeat(2001) })).toThrow();
    expect(() => confirmAiAlertSchema.parse({ force: true })).toThrow();
  });
});

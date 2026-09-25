import { describe, expect, it } from 'vitest';
import {
  createAiAlertFeedbackSchema,
  listAiAlertFeedbackQuerySchema,
} from '../src/modules/ai-anomaly-detection-alerts/dto/ai-alert-feedback.dto.js';

describe('AI alert feedback DTOs', () => {
  it('accepts a bounded reliability assessment', () => {
    expect(
      createAiAlertFeedbackSchema.parse({ feedbackLabel: 'false_positive', comment: 'Benign job' }),
    ).toEqual({ feedbackLabel: 'false_positive', comment: 'Benign job' });
  });

  it('rejects unsupported labels and oversized comments', () => {
    expect(() => createAiAlertFeedbackSchema.parse({ feedbackLabel: 'accurate' })).toThrow();
    expect(() =>
      createAiAlertFeedbackSchema.parse({
        feedbackLabel: 'needs_review',
        comment: 'x'.repeat(2001),
      }),
    ).toThrow();
  });

  it('coerces pagination defaults and enforces its limit', () => {
    expect(listAiAlertFeedbackQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      sortOrder: 'desc',
    });
    expect(() => listAiAlertFeedbackQuerySchema.parse({ limit: '101' })).toThrow();
  });
});

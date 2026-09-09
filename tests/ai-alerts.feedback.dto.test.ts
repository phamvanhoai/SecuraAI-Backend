import { describe, expect, it } from 'vitest';
import {
  alertIdParamsSchema,
  evaluateAlertReliabilityBodySchema,
} from '../src/modules/ai-alerts/dto/alert-feedback.dto.js';

describe('AI alert reliability DTO', () => {
  it('accepts each approved reliability label and trims comments', () => {
    for (const feedbackLabel of ['confirmed_incident', 'false_positive', 'needs_review']) {
      expect(evaluateAlertReliabilityBodySchema.parse({ feedbackLabel, comment: '  reviewed  ' }))
        .toMatchObject({ feedbackLabel, comment: 'reviewed' });
    }
  });

  it('rejects unknown labels, empty comments, extra fields and invalid IDs', () => {
    expect(evaluateAlertReliabilityBodySchema.safeParse({ feedbackLabel: 'accurate' }).success).toBe(false);
    expect(evaluateAlertReliabilityBodySchema.safeParse({ feedbackLabel: 'needs_review', comment: ' ' }).success).toBe(false);
    expect(evaluateAlertReliabilityBodySchema.safeParse({ feedbackLabel: 'needs_review', extra: true }).success).toBe(false);
    expect(alertIdParamsSchema.safeParse({ alertId: 'not-a-uuid' }).success).toBe(false);
  });
});

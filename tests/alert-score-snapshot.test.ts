import { describe, expect, it } from 'vitest';
import { peakSnapshot } from '../src/modules/ai-anomaly-detection-alerts/alert-score-snapshot.js';

describe('alert peak score projection', () => {
  it('keeps the strongest valid evidence regardless of history order and ignores invalid metadata', () => {
    const entry = (score: number) => ({ feature_name: 'alert_score_update', feature_value: JSON.stringify({ score, threshold: 0.7, features: [] }) });
    expect(peakSnapshot([entry(0.8), entry(0.6), entry(0.95), entry(1.2), { feature_name: 'alert_score_update', feature_value: '{' }], 0.57)?.score).toBe(0.95);
    expect(peakSnapshot([entry(0.5)], 0.57)).toBeNull();
  });
});

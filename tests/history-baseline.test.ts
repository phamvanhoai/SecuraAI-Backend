import { describe, expect, it } from 'vitest';
import {
  compareHistory,
  type BaselineObservation,
} from '../src/modules/ai-anomaly-detection-alerts/history-baseline.js';
const time = 200 * 300_000;
const current: BaselineObservation = {
  id: 'now',
  time,
  failed: true,
  successful: false,
  ip: 'known',
  device: 'known',
  hour: 8,
};
const history = Array.from({ length: 40 }, (_, i) => ({
  ...current,
  id: `old-${i}`,
  time: time - (i + 3) * 300_000,
  failed: i < 2,
  successful: i >= 2,
}));
describe('empirical historical baseline', () => {
  it('uses observed tail counts with finite-sample smoothing and no fixed points', () => {
    const ordinary = compareHistory(current, history, 300_000, 20, false);
    const burst = compareHistory(
      current,
      [...history, { ...current, id: 'recent', time: time - 1000 }],
      300_000,
      20,
      false,
    );
    expect(ordinary.score).toBeCloseTo(1 - 3 / 41, 7);
    expect(burst.score).toBeCloseTo(1 - 1 / 41, 7);
    expect(burst.score).toBeGreaterThan(ordinary.score ?? 0);
    expect(burst.comparisons[0]).toMatchObject({
      observed: 2,
      samples: 40,
      equallyOrMoreUnusual: 0,
    });
  });
  it('withholds scores for insufficient, truncated or unsupported history', () => {
    expect(compareHistory(current, history.slice(0, 5), 300_000, 20, false).score).toBeNull();
    expect(compareHistory(current, history, 300_000, 20, true).reason).toBe('HISTORY_TRUNCATED');
    expect(
      compareHistory({ ...current, failed: false }, history, 300_000, 20, false).score,
    ).toBeNull();
  });
  it('does not call constantly changing IP addresses anomalous solely because they are new', () => {
    const known = history.map((item) => ({ ...item, failed: false, successful: true }));
    const target = { ...current, failed: false, successful: true, ip: 'new' };
    expect(compareHistory(target, known, 300_000, 20, false).score).toBeGreaterThan(0.8);
    const variable = known.map((item, i) => ({ ...item, ip: `ip-${i}` }));
    expect(compareHistory(target, variable, 300_000, 20, false).score).toBe(0);
  });
  it('ignores the current observation window when building its reference distribution', () => {
    const base = compareHistory(current, history, 300_000, 20, false);
    const recent = compareHistory(
      current,
      [...history, { ...current, id: 'recent', time: time - 1 }],
      300_000,
      20,
      false,
    );
    expect(recent.activeWindows).toBe(base.activeWindows);
  });
});

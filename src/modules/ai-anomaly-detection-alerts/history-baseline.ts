export interface BaselineObservation {
  id: string;
  principal?: string | null;
  time: number;
  failed: boolean;
  successful: boolean;
  ip: string | null;
  device: string | null;
  hour: number;
}

export const BASELINE_WINDOWS = [1, 5, 15, 60] as const;

export interface WindowBaselineResult {
  windowMinutes: number;
  status: 'READY' | 'INSUFFICIENT_BASELINE';
  reason: string | null;
  score: number | null;
  activeWindows: number;
  minimumSamples: number;
  currentFailures: number;
  tailFraction: number | null;
}

/** Empirical rank, not a calibrated attack probability. No invented risk points. */
export function compareHistory(
  current: BaselineObservation,
  history: readonly BaselineObservation[],
  windowMs: number,
  minimumSamples: number,
  truncated: boolean,
) {
  const cutoff = current.time - windowMs;
  const completed = history.filter((item) => item.time < cutoff);
  const buckets = new Map<string, BaselineObservation[]>();
  for (const item of completed) {
    const key = Math.floor(item.time / windowMs);
    // Exclude the bucket overlapping the current rolling observation window.
    if ((key + 1) * windowMs > cutoff) continue;
    const bucketId = `${item.principal ?? ''}:${key}`;
    const bucket = buckets.get(bucketId) ?? [];
    bucket.push(item);
    buckets.set(bucketId, bucket);
  }
  const currentFailures =
    history.filter(
      (item) =>
        item.id !== current.id &&
        item.principal === current.principal &&
        item.time >= cutoff &&
        item.time <= current.time &&
        item.failed,
    ).length + Number(current.failed);
  const supported = current.failed || current.successful;
  const ready = supported && !truncated && buckets.size >= minimumSamples;
  const comparisons: Array<{
    signal: string;
    observed: number;
    samples: number;
    equallyOrMoreUnusual: number;
    tailFraction: number;
  }> = [];
  if (ready) {
    const counts = [...buckets.values()].map(
      (bucket) => bucket.filter((item) => item.failed).length,
    );
    const higher = counts.filter((count) => count >= currentFailures).length;
    comparisons.push({
      signal: 'failures_per_window',
      observed: currentFailures,
      samples: counts.length,
      equallyOrMoreUnusual: higher,
      tailFraction: (higher + 1) / (counts.length + 1),
    });
    // Contextual novelty applies only to successful access and only with
    // sufficient previous successful observations. No assumed business hours.
    const successes = completed.filter((item) => item.successful);
    if (current.successful && successes.length >= minimumSamples) {
      for (const field of ['ip', 'device', 'hour'] as const) {
        const value = current[field];
        if (value === null) continue;
        const samples = successes.filter((item) => item[field] !== null);
        if (samples.length < minimumSamples) continue;
        const frequencies = new Map<string | number, number>();
        for (const item of samples) {
          const key = item[field];
          if (key !== null) frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
        }
        const observed = frequencies.get(value) ?? 0;
        // Leave-one-out recurrence for historical observations avoids making
        // constantly changing IPs/devices look anomalous solely for being new.
        const unusual = samples.filter(
          (item) => (frequencies.get(item[field] ?? '') ?? 0) - 1 <= observed,
        ).length;
        comparisons.push({
          signal: `${field}_rarity`,
          observed,
          samples: samples.length,
          equallyOrMoreUnusual: unusual,
          tailFraction: (unusual + 1) / (samples.length + 1),
        });
      }
    }
  }
  const adjustedTail = comparisons.length
    ? Math.min(1, Math.min(...comparisons.map((item) => item.tailFraction)) * comparisons.length)
    : 1;
  return {
    method: 'empirical-history-v1',
    status: ready ? 'READY' : 'INSUFFICIENT_BASELINE',
    reason: !supported
      ? 'UNSUPPORTED_EVENT_OUTCOME'
      : truncated
        ? 'HISTORY_TRUNCATED'
        : buckets.size < minimumSamples
          ? 'TOO_FEW_ACTIVE_WINDOWS'
          : null,
    score: ready ? Number((1 - adjustedTail).toFixed(8)) : null,
    activeWindows: buckets.size,
    minimumSamples,
    windowMinutes: windowMs / 60_000,
    currentFailures,
    comparisons,
    adjustment: 'BONFERRONI',
    adjustedTail,
  };
}

/**
 * Compares the same event over several rolling horizons. The windows overlap, so their
 * scores are not averaged or treated as independent evidence. A Bonferroni correction
 * is applied to the most unusual ready window before producing one conservative score.
 */
export function compareMultiWindowHistory(
  current: BaselineObservation,
  history: readonly BaselineObservation[],
  minimumSamples: number,
  truncated: boolean,
  windowMinutes: readonly number[] = BASELINE_WINDOWS,
) {
  const windows: WindowBaselineResult[] = windowMinutes.map((minutes) => {
    const requiredSamples = minimumSamples;
    const result = compareHistory(
      current,
      history,
      minutes * 60_000,
      requiredSamples,
      truncated,
    );
    const failureComparison = result.comparisons.find(
      (comparison) => comparison.signal === 'failures_per_window',
    );
    return {
      windowMinutes: minutes,
      status: result.status === 'READY' ? 'READY' as const : 'INSUFFICIENT_BASELINE' as const,
      reason: result.reason,
      score: failureComparison ? Number((1 - failureComparison.tailFraction).toFixed(8)) : null,
      activeWindows: result.activeWindows,
      minimumSamples: requiredSamples,
      currentFailures: result.currentFailures,
      tailFraction: failureComparison?.tailFraction ?? null,
    };
  });
  const ready = windows.filter(
    (window): window is WindowBaselineResult & { tailFraction: number } =>
      window.status === 'READY' && window.tailFraction !== null,
  );
  const adjustedTail = ready.length
    ? Math.min(1, Math.min(...ready.map((window) => window.tailFraction)) * ready.length)
    : 1;
  const primary = windows[0];
  return {
    method: 'empirical-history-multi-window-v2',
    status: ready.length ? 'READY' as const : 'INSUFFICIENT_BASELINE' as const,
    reason: ready.length ? null : (primary?.reason ?? 'TOO_FEW_ACTIVE_WINDOWS'),
    score: ready.length ? Number((1 - adjustedTail).toFixed(8)) : null,
    activeWindows: primary?.activeWindows ?? 0,
    minimumSamples,
    windowMinutes: primary?.windowMinutes ?? 5,
    currentFailures: primary?.currentFailures ?? Number(current.failed),
    windows,
    comparisons: ready.map((window) => ({
      signal: `failures_${window.windowMinutes}m`,
      observed: window.currentFailures,
      samples: window.activeWindows,
      equallyOrMoreUnusual: Math.max(
        0,
        Math.round(window.tailFraction * (window.activeWindows + 1) - 1),
      ),
      tailFraction: window.tailFraction,
    })),
    adjustment: 'BONFERRONI_OVER_READY_WINDOWS',
    adjustedTail,
  };
}

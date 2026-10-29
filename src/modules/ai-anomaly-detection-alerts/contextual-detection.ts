import { createHash } from 'node:crypto';
import { z } from 'zod';

export const detectionPolicySchema = z
  .object({
    timeZone: z
      .string()
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      })
      .default('Asia/Ho_Chi_Minh'),
    workdayStartHour: z.number().int().min(0).max(23).default(6),
    workdayEndHour: z.number().int().min(1).max(24).default(22),
    windowMinutes: z.number().int().min(1).max(60).default(5),
    authenticationFailures: z.number().int().min(2).max(1000).default(5),
    applicationDenials: z.number().int().min(2).max(1000).default(10),
    vpnFailures: z.number().int().min(2).max(1000).default(5),
    minimumBaselineEvents: z.number().int().min(5).max(1000).default(20),
  })
  .refine((p) => p.workdayStartHour < p.workdayEndHour, 'Working hours must start before they end');

export type DetectionPolicy = z.infer<typeof detectionPolicySchema>;
export interface ContextEvent {
  id: string;
  event_source_id: string;
  event_family: string;
  event_type: string;
  occurred_at: Date;
  account_identifier: string | null;
  source_ip: string | null;
  device_identifier: string | null;
  severity: string | null;
  normalized_payload: unknown;
}
export interface DetectionFeature {
  featureName: string;
  featureValue: string;
  contributionScore: number;
  rank: number;
}
export interface ContextualDecision {
  score: number;
  matchedRules: string[];
  features: DetectionFeature[];
  groupKey: string;
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function application(event: ContextEvent): string | null {
  const payload = object(event.normalized_payload);
  const metadata = object(payload.metadata);
  const app = object(payload.application);
  const value =
    payload.applicationId ??
    payload.applicationName ??
    app.id ??
    app.name ??
    metadata.applicationId ??
    metadata.applicationName ??
    metadata.application;
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 255) : null;
}
function severity(value: string | null): number {
  const names: Record<string, number> = { critical: 1, high: 0.85, medium: 0.55, low: 0.2 };
  if (value === null || value.trim() === '') return 0;
  return (
    names[value.toLowerCase()] ??
    (Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value) / 15)) : 0)
  );
}
const failure = (event: ContextEvent): boolean =>
  (event.event_family === 'AUTHENTICATION'
    ? ['LOGIN_FAILURE', 'LOGIN_FAILED']
    : event.event_family === 'VPN_SSO'
      ? ['VPN_LOGIN_FAILURE', 'SSO_LOGIN_FAILURE', 'VPN_LOGIN_FAILED', 'SSO_LOGIN_FAILED']
      : event.event_family === 'APPLICATION_ACCESS'
        ? ['ACCESS_DENIED']
        : []
  ).includes(event.event_type.toUpperCase());
const success = (event: ContextEvent): boolean =>
  (event.event_family === 'AUTHENTICATION'
    ? ['LOGIN_SUCCESS']
    : event.event_family === 'VPN_SSO'
      ? ['VPN_LOGIN_SUCCESS', 'SSO_LOGIN_SUCCESS']
      : event.event_family === 'APPLICATION_ACCESS'
        ? ['APPLICATION_LOGIN', 'ACCESS_GRANTED']
        : []
  ).includes(event.event_type.toUpperCase());
const protocol = (event: ContextEvent): string =>
  event.event_type.toUpperCase().startsWith('SSO_')
    ? 'SSO'
    : event.event_type.toUpperCase().startsWith('VPN_')
      ? 'VPN'
      : event.event_family;

/** History must be from this source and contain no events later than the evaluated event. */
export function evaluateContext(
  event: ContextEvent,
  history: readonly ContextEvent[],
  truncated: boolean,
  policy: DetectionPolicy,
  weights = { severity: 0.45, rarity: 0.35, offHours: 0.2 },
): ContextualDecision {
  const time = event.occurred_at.getTime();
  const baseline = history.filter(
    (item) =>
      item.id !== event.id &&
      item.event_source_id === event.event_source_id &&
      (item.occurred_at.getTime() < time ||
        (item.occurred_at.getTime() === time && item.id < event.id)) &&
      item.occurred_at.getTime() >= time - 7 * 86_400_000,
  );
  const window = baseline.filter(
    (item) =>
      item.occurred_at.getTime() >= time - policy.windowMinutes * 60_000 &&
      item.event_family === event.event_family,
  );
  const sameActor = (item: ContextEvent) =>
    Boolean(event.account_identifier && item.account_identifier === event.account_identifier);
  const sameIp = (item: ContextEvent) =>
    Boolean(event.source_ip && item.source_ip === event.source_ip);
  const samePrincipal = (item: ContextEvent) =>
    event.account_identifier ? sameActor(item) : sameIp(item);
  const app = application(event);
  const sameApplication = (item: ContextEvent) => application(item) === app;
  const related = window.filter(
    (item) =>
      protocol(item) === protocol(event) &&
      samePrincipal(item) &&
      (event.event_family !== 'APPLICATION_ACCESS' || sameApplication(item)) &&
      (!event.source_ip || sameIp(item)),
  );
  const failures = related.filter(failure);
  const count = failures.length + (failure(event) ? 1 : 0);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: policy.timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(event.occurred_at),
  );
  const offHours = hour < policy.workdayStartHour || hour >= policy.workdayEndHour;
  const actorHistory = baseline.filter(
    (item) => sameActor(item) && protocol(item) === protocol(event) && success(item),
  );
  const baselineReady = !truncated && actorHistory.length >= policy.minimumBaselineEvents;
  const newIp = baselineReady && Boolean(event.source_ip) && !actorHistory.some(sameIp);
  const newDevice =
    baselineReady &&
    Boolean(event.device_identifier) &&
    !actorHistory.some((item) => item.device_identifier === event.device_identifier);
  const rules: string[] = [];
  const principalPresent = Boolean(event.account_identifier || event.source_ip);
  if (principalPresent && event.event_family === 'AUTHENTICATION') {
    if (failure(event) && count >= policy.authenticationFailures) rules.push('AUTH_FAILURE_BURST');
    if (success(event) && failures.length >= policy.authenticationFailures)
      rules.push('AUTH_SUCCESS_AFTER_FAILURE');
  }
  if (principalPresent && app && event.event_family === 'APPLICATION_ACCESS') {
    if (failure(event) && count >= policy.applicationDenials) rules.push('APP_DENIAL_BURST');
    if (success(event) && failures.length >= policy.applicationDenials)
      rules.push('APP_SUCCESS_AFTER_DENIAL');
  }
  if (principalPresent && event.event_family === 'VPN_SSO') {
    if (failure(event) && count >= policy.vpnFailures) rules.push('VPN_SSO_FAILURE_BURST');
    if (success(event) && offHours && (newIp || newDevice))
      rules.push('VPN_SSO_NEW_CONTEXT_OFF_HOURS');
  }
  const failureThreshold =
    event.event_family === 'APPLICATION_ACCESS'
      ? policy.applicationDenials
      : event.event_family === 'VPN_SSO'
        ? policy.vpnFailures
        : policy.authenticationFailures;
  const behavior = Math.max(
    principalPresent ? Math.min(1, count / failureThreshold) : 0,
    newIp || newDevice ? 0.8 : 0,
  );
  // The legacy rarity weight now weights entity-context evidence, not global event frequency.
  const totalWeight = weights.severity + weights.rarity + weights.offHours;
  const terms = {
    severity: totalWeight ? (severity(event.severity) * weights.severity) / totalWeight : 0,
    behavior: totalWeight ? (behavior * weights.rarity) / totalWeight : 0,
    offHours: totalWeight && offHours ? weights.offHours / totalWeight : 0,
  };
  // A matched rule supplies a minimum signal, not a probability. Additional
  // evidence raises it within a bounded, reproducible prioritization scale.
  const ruleTerms = {
    base: 0.55,
    excessFailures: Math.min(0.2, Math.max(0, count / failureThreshold - 1) * 0.1),
    rapidSequence:
      count >= failureThreshold && failures.length > 0
        ? Math.min(
            0.1,
            Math.max(
              0,
              1 -
                (time - Math.min(...failures.map((item) => item.occurred_at.getTime()))) /
                  (policy.windowMinutes * 60_000),
            ) * 0.1,
          )
        : 0,
    sourceSeverity: severity(event.severity) * 0.1,
    offHours: offHours ? 0.05 : 0,
    newIp: newIp ? 0.05 : 0,
    newDevice: newDevice ? 0.05 : 0,
    successAfterFailures: rules.some(
      (rule) => rule.endsWith('SUCCESS_AFTER_FAILURE') || rule.endsWith('SUCCESS_AFTER_DENIAL'),
    )
      ? 0.1
      : 0,
  };
  const score = rules.length
    ? Number(
        Math.min(
          0.99,
          Object.values(ruleTerms).reduce((sum, term) => sum + term, 0),
        ).toFixed(8),
      )
    : Number(Math.min(1, terms.severity + terms.behavior + terms.offHours).toFixed(8));
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        'evidence-weighted-v3',
        event.event_source_id,
        event.event_family,
        event.account_identifier ?? event.source_ip ?? event.id,
        event.source_ip,
        app,
        protocol(event),
        rules[0] ?? 'BEHAVIOR_SCORE',
      ]),
    )
    .digest('hex');
  const values: Array<[string, unknown, number]> = [
    ['matched_rules', rules, rules.length ? score : 0],
    ['rule_score_breakdown', { revision: 'evidence-weighted-v3', ...ruleTerms, cap: 0.99 }, 0],
    [
      'failure_count_in_window',
      {
        count,
        windowMinutes: policy.windowMinutes,
        account: event.account_identifier,
        sourceIp: event.source_ip,
        application: app ?? 'source-level context',
      },
      0,
    ],
    [
      'working_hours',
      {
        timeZone: policy.timeZone,
        startHour: policy.workdayStartHour,
        endHour: policy.workdayEndHour,
        localHour: hour,
        offHours,
      },
      rules.length ? 0 : terms.offHours,
    ],
    [
      'baseline_context',
      {
        successfulEvents: actorHistory.length,
        ready: baselineReady,
        truncated,
        newIp,
        newDevice,
        lookbackDays: 7,
      },
      0,
    ],
    ['source_severity', event.severity, rules.length ? 0 : terms.severity],
    [
      'contextual_behavior',
      { strength: behavior, failureThreshold },
      rules.length ? 0 : terms.behavior,
    ],
    [
      'evidence_event_ids',
      [
        ...failures
          .sort(
            (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime() || a.id.localeCompare(b.id),
          )
          .slice(-10)
          .map((item) => item.id),
        event.id,
      ],
      0,
    ],
    ['detection_group', key, 0],
    ['engine_version', 'contextual-rules-v1', 0],
    ['policy_snapshot', policy, 0],
    ['weight_snapshot', weights, 0],
  ];
  return {
    score,
    matchedRules: rules,
    groupKey: key,
    features: values
      .sort((a, b) => b[2] - a[2])
      .map(([featureName, value, contributionScore], i) => ({
        featureName,
        featureValue: JSON.stringify(value),
        contributionScore,
        rank: i + 1,
      })),
  };
}

export function detectionSeverity(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 0.9) return 'CRITICAL';
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { importEventsBodySchema } from '../src/modules/event-ingestion/dto/import-events.dto.js';
import {
  detectionPolicySchema,
  evaluateContext,
  type ContextEvent,
} from '../src/modules/ai-anomaly-detection-alerts/contextual-detection.js';

const policy = detectionPolicySchema.parse({});
const now = new Date('2026-10-29T18:00:00Z'); // 01:00 in Vietnam
function event(
  id: string,
  family = 'AUTHENTICATION',
  type = 'LOGIN_FAILURE',
  minutesAgo = 0,
): ContextEvent {
  return {
    id,
    event_source_id: 'source',
    event_family: family,
    event_type: type,
    occurred_at: new Date(now.getTime() - minutesAgo * 60_000),
    account_identifier: 'alice',
    source_ip: '192.0.2.1',
    device_identifier: 'laptop',
    severity: 'LOW',
    normalized_payload: { applicationId: 'portal' },
  };
}
const failures = (family = 'AUTHENTICATION', type = 'LOGIN_FAILURE', count = 4) =>
  Array.from({ length: count }, (_, i) => event(`previous-${i}`, family, type, 1 + i * 0.1));
describe('contextual detection rules v1', () => {
  it('allows source-family peers for cold start only with enough distinct principals', () => {
    const target = event('target');
    const peers = Array.from({ length: 40 }, (_, i) => ({
      ...event(`peer-${i}`, 'AUTHENTICATION', 'LOGIN_SUCCESS', 20 + i * 6),
      account_identifier: `peer-${i % 5}`,
    }));
    expect(evaluateContext(target, peers, false, policy).baselineReady).toBe(false);
    const fallback = evaluateContext(target, peers, false, policy, undefined, true);
    expect(fallback.baselineReady).toBe(true);
    expect(fallback.score).toBeGreaterThan(0.9);
    expect(
      evaluateContext(
        target,
        peers.map((p) => ({ ...p, account_identifier: 'one-peer' })),
        false,
        policy,
        undefined,
        true,
      ).baselineReady,
    ).toBe(false);
    expect(
      evaluateContext(
        { ...target, event_source_id: 'other' },
        peers,
        false,
        policy,
        undefined,
        true,
      ).baselineReady,
    ).toBe(false);
  });
  it('recognizes imported LOGIN_FAILED as the same failure outcome as Wazuh LOGIN_FAILURE', () => {
    const target = event('target', 'AUTHENTICATION', 'LOGIN_FAILED');
    expect(
      evaluateContext(target, failures('AUTHENTICATION', 'LOGIN_FAILED'), false, policy)
        .matchedRules,
    ).toContain('AUTH_FAILURE_BURST');
    expect(
      evaluateContext(
        event('success', 'AUTHENTICATION', 'LOGIN_SUCCESS'),
        failures('AUTHENTICATION', 'LOGIN_FAILED', 5),
        false,
        policy,
      ).matchedRules,
    ).toContain('AUTH_SUCCESS_AFTER_FAILURE');
  });
  it('validates the import demo and exercises all six rules while keeping normal events below threshold', async () => {
    const raw: unknown = JSON.parse(await readFile('docs/contextual-detection-demo.json', 'utf8'));
    const parsed = importEventsBodySchema.parse({ events: raw });
    const history: ContextEvent[] = parsed.events.map((item) => ({
      id: String(item.externalEventId),
      event_source_id: 'demo-source',
      event_family: String(item.eventFamily),
      event_type: String(item.eventType),
      occurred_at: new Date(String(item.occurredAt)),
      account_identifier: String(item.accountIdentifier),
      source_ip: String(item.sourceIp),
      device_identifier: String(item.deviceIdentifier),
      severity: String(item.severity),
      normalized_payload: item.normalizedPayload,
    }));
    const results = history.map((item) => evaluateContext(item, history, false, policy));
    expect(new Set(results.flatMap((item) => item.matchedRules)).size).toBe(6);
    expect(results.filter((item) => item.matchedRules.length).length).toBe(9);
    expect(
      results.slice(-3).every((item) => item.score < 0.5 && item.matchedRules.length === 0),
    ).toBe(true);
  });
  it.each([
    ['AUTHENTICATION', 'LOGIN_FAILURE', 4, 'AUTH_FAILURE_BURST'],
    ['AUTHENTICATION', 'LOGIN_SUCCESS', 5, 'AUTH_SUCCESS_AFTER_FAILURE'],
    ['APPLICATION_ACCESS', 'ACCESS_DENIED', 9, 'APP_DENIAL_BURST'],
    ['APPLICATION_ACCESS', 'APPLICATION_LOGIN', 10, 'APP_SUCCESS_AFTER_DENIAL'],
    ['VPN_SSO', 'VPN_LOGIN_FAILURE', 4, 'VPN_SSO_FAILURE_BURST'],
  ])('detects %s %s with event-time evidence', (family, type, count, rule) => {
    const failType =
      family === 'APPLICATION_ACCESS'
        ? 'ACCESS_DENIED'
        : family === 'VPN_SSO'
          ? 'VPN_LOGIN_FAILURE'
          : 'LOGIN_FAILURE';
    const result = evaluateContext(
      event('target', family, type),
      failures(family, failType, count),
      false,
      policy,
    );
    expect(result.matchedRules).toContain(rule);
    expect(result.baselineReady).toBe(false);
    expect(result.score).toBe(0);
    expect(
      result.features.find((item) => item.featureName === 'evidence_event_ids')?.featureValue,
    ).toContain('target');
  });
  it('detects a new VPN context outside configured local hours only after sufficient successful history', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      ...event(`old-${i}`, 'VPN_SSO', 'VPN_LOGIN_SUCCESS', 60 + i),
      source_ip: '192.0.2.2',
    }));
    const target = event('target', 'VPN_SSO', 'VPN_LOGIN_SUCCESS');
    expect(evaluateContext(target, history, false, policy).matchedRules).toContain(
      'VPN_SSO_NEW_CONTEXT_OFF_HOURS',
    );
    expect(evaluateContext(target, history.slice(0, 3), false, policy).matchedRules).toEqual([]);
    expect(evaluateContext(target, history, true, policy).matchedRules).toEqual([]);
  });
  it('does not mix accounts, sources, IPs, applications or VPN/SSO protocols', () => {
    for (const patch of [
      { account_identifier: 'bob' },
      { event_source_id: 'other' },
      { source_ip: '192.0.2.2' },
    ]) {
      expect(
        evaluateContext(
          event('target'),
          failures().map((item) => ({ ...item, ...patch })),
          false,
          policy,
        ).matchedRules,
      ).toEqual([]);
    }
    expect(
      evaluateContext(
        event('target', 'APPLICATION_ACCESS', 'APPLICATION_LOGIN'),
        failures('APPLICATION_ACCESS', 'ACCESS_DENIED', 10).map((item) => ({
          ...item,
          normalized_payload: { applicationId: 'other-app' },
        })),
        false,
        policy,
      ).matchedRules,
    ).toEqual([]);
    expect(
      evaluateContext(
        event('target', 'VPN_SSO', 'SSO_LOGIN_FAILURE'),
        failures('VPN_SSO', 'VPN_LOGIN_FAILURE'),
        false,
        policy,
      ).matchedRules,
    ).toEqual([]);
  });
  it('ignores future, out-of-window and duplicate/self events', () => {
    const target = event('target');
    expect(
      evaluateContext(
        target,
        [
          ...failures().map((item) => ({ ...item, occurred_at: new Date(now.getTime() + 1000) })),
          target,
        ],
        false,
        policy,
      ).matchedRules,
    ).toEqual([]);
    expect(
      evaluateContext(
        target,
        failures().map((item) => ({ ...item, occurred_at: new Date(now.getTime() - 6 * 60_000) })),
        false,
        policy,
      ).matchedRules,
    ).toEqual([]);
  });
  it('counts history across manual batch boundaries and provides stable grouping', () => {
    const target = event('target');
    const first = evaluateContext(target, failures(), false, policy);
    const next = evaluateContext(event('target2'), [...failures(), target], false, policy);
    expect(first.groupKey).toBe(next.groupKey);
    expect(first.matchedRules).toEqual(next.matchedRules);
  });
  it('never invents missing identifiers or severity and uses configured time zone', () => {
    const target = {
      ...event('target'),
      account_identifier: null,
      source_ip: null,
      severity: null,
    };
    expect(evaluateContext(target, failures(), false, policy).matchedRules).toEqual([]);
    expect(evaluateContext(target, [], false, policy).score).toBe(0);
    expect(
      evaluateContext(target, [], false, detectionPolicySchema.parse({ timeZone: 'UTC' })).score,
    ).toBe(0);
    expect(detectionPolicySchema.safeParse({ timeZone: 'invalid' }).success).toBe(false);
  });
});

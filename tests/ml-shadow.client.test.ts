import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DetectionEvent } from '../src/modules/ai-anomaly-detection-alerts/anomaly-detection.repository.js';
import {
  buildMlPredictionPayload,
  buildMlTemporalContext,
  requestMlShadowPrediction,
} from '../src/modules/ai-anomaly-detection-alerts/ml-shadow.client.js';

function event(): DetectionEvent {
  return {
    id: 'event-1',
    event_source_id: 'source-1',
    event_family: 'AUTHENTICATION',
    account_identifier: 'alice',
    source_ip: '203.0.113.5',
    device_identifier: 'win-01',
    event_type: 'LOGIN_FAILURE',
    severity: '8',
    occurred_at: new Date('2026-11-02T10:00:00.000Z'),
    normalized_payload: {
      rawEventId: 'wazuh-1',
      agent: { name: 'win-01' },
      metadata: {
        platform: 'windows',
        eventId: '4625',
        logonType: '3',
        processName: 'C:\\Windows\\System32\\lsass.exe',
        status: 'failure',
      },
    },
    event_entity_mappings: [],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ML shadow client', () => {
  it('maps a normalized Wazuh event to the classifier contract', () => {
    expect(buildMlPredictionPayload(event())).toMatchObject({
      timestamp: '2026-11-02T10:00:00.000Z',
      eventId: '4625',
      providerName: 'Microsoft-Windows-Security-Auditing',
      severityValue: '8',
      inputType: 'AUTHENTICATION',
      logonType: '3',
      processPath: 'C:\\Windows\\System32\\lsass.exe',
      sourceIp: '203.0.113.5',
      status: 'failure',
      eventFamily: 'AUTHENTICATION',
      eventType: 'LOGIN_FAILURE',
    });
  });

  it('sends all rolling-window fields to the v7 classifier', () => {
    const temporal = buildMlTemporalContext(event(), []);
    expect(buildMlPredictionPayload(event(), temporal)).toMatchObject({
      events5m: 1,
      events1m: 1,
      failures1m: 1,
      events15m: 1,
      failures15m: 1,
      events60m: 1,
      failures60m: 1,
    });
  });

  it('builds past-only temporal counts for the model', () => {
    const current = event();
    const history = [
      { ...current, id: 'old-1', occurred_at: new Date('2026-11-02T09:59:00.000Z') },
      { ...current, id: 'too-old', occurred_at: new Date('2026-11-02T09:50:00.000Z') },
    ];
    expect(buildMlTemporalContext(current, history)).toEqual({
      events5m: 2,
      failedLogins5m: 2,
      accessDenials5m: 0,
      vpnFailures5m: 0,
      distinctAccounts5m: 1,
      distinctSourceIps5m: 1,
      successAfterFailure5m: false,
      secondsSincePrevious: 60,
      events1m: 2,
      failures1m: 2,
      events15m: 3,
      failures15m: 3,
      events60m: 3,
      failures60m: 3,
    });
  });

  it('returns a validated prediction without changing detection decisions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            label: 'MALICIOUS_APT',
            malicious: true,
            score: 0.8,
            threshold: 0.205125,
            escalationThreshold: 0.1,
            scoreSemantics: 'experimental classifier score',
            modelVersion: 'windows-apt-2025-soft-voting-v1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const result = await requestMlShadowPrediction(event(), {
      baseUrl: 'http://model.test',
      timeoutMs: 100,
    });

    expect(result).toMatchObject({ status: 'PREDICTED', prediction: { malicious: true } });
    expect(fetch).toHaveBeenCalledWith(
      'http://model.test/v1/predict',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails open as unavailable when the service cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(
      requestMlShadowPrediction(event(), { baseUrl: 'http://model.test', timeoutMs: 100 }),
    ).resolves.toEqual({ status: 'UNAVAILABLE', reason: 'NETWORK' });
  });
});

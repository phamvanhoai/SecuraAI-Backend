import { describe, expect, it } from 'vitest';
import { normalizeWazuhEvent } from '../src/modules/event-ingestion/wazuh-event.normalizer.js';

const base = {
  timestamp: '2026-11-03T12:00:00.000Z',
  rule: { id: '100', level: 5, description: 'event' },
  agent: { id: '001', name: 'endpoint-1', ip: '10.0.0.5' },
};

describe('normalizeWazuhEvent', () => {
  it('maps a native Windows 4625 alert to an authentication failure', () => {
    const raw = {
      ...base,
      id: 'wazuh-4625-1',
      rule: { id: '60122', level: 5, description: 'Windows logon failure' },
      data: {
        win: {
          system: {
            eventID: '4625',
            providerName: 'Microsoft-Windows-Security-Auditing',
            channel: 'Security',
          },
          eventdata: {
            targetUserName: 'alice',
            targetDomainName: 'SECURAAI',
            ipAddress: '203.0.113.10',
            logonType: '3',
            authenticationPackageName: 'NTLM',
          },
        },
      },
    };

    const normalized = normalizeWazuhEvent(raw);

    expect(normalized).toMatchObject({
      eventFamily: 'AUTHENTICATION',
      eventType: 'LOGIN_FAILURE',
      rawEventId: 'wazuh-4625-1',
      actor: { username: 'alice', domain: 'SECURAAI' },
      sourceIp: '203.0.113.10',
      metadata: { eventId: '4625', platform: 'windows' },
    });
    expect(normalized.metadata?.rawWazuhEvent).toEqual(raw);
  });

  it('maps a native OpenVPN failure and preserves its original event', () => {
    const raw = {
      ...base,
      rule: { id: '90001', level: 7, description: 'OpenVPN authentication failed' },
      decoder: { name: 'openvpn' },
      location: '/var/log/openvpn.log',
      data: { srcip: '198.51.100.7', username: 'bob' },
    };

    const normalized = normalizeWazuhEvent(raw);

    expect(normalized).toMatchObject({
      eventFamily: 'VPN_SSO',
      eventType: 'VPN_LOGIN_FAILURE',
      actor: { username: 'bob' },
      sourceIp: '198.51.100.7',
    });
    expect(normalized.metadata?.rawWazuhEvent).toEqual(raw);
  });

  it('maps HTTP 403 to application access denied and uses IP as anonymous principal', () => {
    const raw = {
      ...base,
      rule: { id: '31101', level: 5, description: 'Nginx access log' },
      decoder: { name: 'nginx-accesslog' },
      location: '/var/log/nginx/access.log',
      data: {
        srcip: '192.0.2.25',
        http: { response: { status_code: 403 }, request: { host: 'portal.securaai.test' } },
      },
    };

    const normalized = normalizeWazuhEvent(raw);

    expect(normalized).toMatchObject({
      eventFamily: 'APPLICATION_ACCESS',
      eventType: 'ACCESS_DENIED',
      actor: { username: 'ip:192.0.2.25' },
      sourceIp: '192.0.2.25',
      metadata: { applicationName: 'portal.securaai.test' },
    });
  });

  it('rejects process events outside the three supported SecuraAI families', () => {
    expect(() => normalizeWazuhEvent({
      ...base,
      rule: { id: '92000', description: 'Sysmon process creation' },
      data: { win: { system: { eventID: '1' }, eventdata: { targetUserName: 'alice' } } },
    })).toThrowError(/outside AUTHENTICATION, VPN_SSO and APPLICATION_ACCESS/);
  });

  it('does not alter an event already normalized by the edge adapter', () => {
    const normalized = {
      source: { type: 'WAZUH' as const },
      eventFamily: 'AUTHENTICATION' as const,
      eventType: 'LOGIN_SUCCESS',
      timestamp: base.timestamp,
      actor: { username: 'alice' },
      agent: { id: '001', name: 'endpoint-1' },
      rule: { id: '60106' },
    };
    expect(normalizeWazuhEvent(normalized)).toBe(normalized);
  });
});

import { AppError } from '../../common/errors/app-error.js';
import type {
  WazuhEventIngestInput,
  WazuhIngestInput,
  WazuhRawEventInput,
} from './dto/wazuh-event-ingest.dto.js';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function text(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function integer(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function isNormalized(input: WazuhIngestInput): input is WazuhEventIngestInput {
  return 'source' in input && record(input.source).type === 'WAZUH' && 'eventFamily' in input;
}

function classify(raw: WazuhRawEventInput): {
  eventFamily: WazuhEventIngestInput['eventFamily'];
  eventType: string;
} {
  const data = record(raw.data);
  const win = record(data.win);
  const system = record(win.system);
  const eventId = text(system.eventID, system.eventId, data.event_id, data.eventId);
  if (eventId === '4625') return { eventFamily: 'AUTHENTICATION', eventType: 'LOGIN_FAILURE' };
  if (eventId === '4624') return { eventFamily: 'AUTHENTICATION', eventType: 'LOGIN_SUCCESS' };

  const http = record(data.http);
  const response = record(http.response);
  const status = integer(
    response.status_code ?? response.statusCode ?? data.status_code ?? data.statusCode,
  );
  const haystack = [
    raw.rule.description,
    ...(raw.rule.groups ?? []),
    raw.decoder?.name,
    raw.location,
    raw.full_log,
  ].filter((value): value is string => typeof value === 'string').join(' ').toLowerCase();

  const failed = /fail|denied|invalid|unauthori[sz]ed|forbidden/.test(haystack);
  const successful = /success|accepted|granted/.test(haystack);
  const vpn = /\b(vpn|openvpn|wireguard|ipsec|ikev2|anyconnect|globalprotect)\b/.test(haystack);
  const sso = /\b(sso|saml|oauth|openid|keycloak|okta|adfs)\b/.test(haystack);
  if (vpn || sso) {
    if (!failed && !successful) {
      throw new AppError(422, 'UNSUPPORTED_WAZUH_EVENT', 'VPN/SSO event has no recognizable outcome');
    }
    const prefix = sso ? 'SSO' : 'VPN';
    return { eventFamily: 'VPN_SSO', eventType: `${prefix}_LOGIN_${failed ? 'FAILURE' : 'SUCCESS'}` };
  }

  const web = status !== undefined || /apache|nginx|iis|http|web|wordpress/.test(haystack);
  if (web) {
    if (status === 401 || status === 403 || failed) {
      return { eventFamily: 'APPLICATION_ACCESS', eventType: 'ACCESS_DENIED' };
    }
    if ((status !== undefined && status >= 200 && status < 400) || successful) {
      return { eventFamily: 'APPLICATION_ACCESS', eventType: 'ACCESS_GRANTED' };
    }
  }
  throw new AppError(
    422,
    'UNSUPPORTED_WAZUH_EVENT',
    `Wazuh event ${eventId ?? raw.rule.id} is outside AUTHENTICATION, VPN_SSO and APPLICATION_ACCESS`,
  );
}

export function normalizeWazuhEvent(input: WazuhIngestInput): WazuhEventIngestInput {
  if (isNormalized(input)) return input;
  const raw = input;
  const data = record(raw.data);
  const win = record(data.win);
  const system = record(win.system);
  const eventData = record(win.eventdata);
  const http = record(data.http);
  const request = record(http.request);
  const classification = classify(raw);
  const sourceIp = text(
    eventData.ipAddress,
    eventData.sourceIp,
    data.srcip,
    data.src_ip,
    data.sourceIp,
    data.remote_addr,
  );
  const username = text(
    eventData.targetUserName,
    eventData.subjectUserName,
    data.dstuser,
    data.srcuser,
    data.user,
    data.username,
  ) ?? (classification.eventFamily === 'APPLICATION_ACCESS' && sourceIp ? `ip:${sourceIp}` : undefined);
  if (!username) {
    throw new AppError(422, 'MISSING_WAZUH_PRINCIPAL', 'Wazuh event requires a username or source IP');
  }
  const applicationName = text(
    data.application,
    data.app,
    request.host,
    data.hostname,
    raw.location,
  );
  return {
    source: { type: 'WAZUH' },
    eventFamily: classification.eventFamily,
    eventType: classification.eventType,
    timestamp: text(raw.timestamp, raw['@timestamp']) as string,
    ...(text(raw.id, data.id) ? { rawEventId: text(raw.id, data.id) } : {}),
    actor: {
      username,
      ...(text(eventData.subjectDomainName, eventData.targetDomainName)
        ? { domain: text(eventData.subjectDomainName, eventData.targetDomainName) }
        : {}),
      ...(text(eventData.targetUserSid, eventData.subjectUserSid)
        ? { userId: text(eventData.targetUserSid, eventData.subjectUserSid) }
        : {}),
    },
    ...(sourceIp ? { sourceIp } : {}),
    agent: {
      id: String(raw.agent.id),
      name: raw.agent.name,
      ...(raw.agent.ip ? { ip: raw.agent.ip } : {}),
    },
    rule: {
      id: String(raw.rule.id),
      ...(raw.rule.level !== undefined ? { level: raw.rule.level } : {}),
      ...(raw.rule.description ? { description: raw.rule.description } : {}),
    },
    metadata: {
      rawWazuhEvent: raw,
      platform: win.system ? 'windows' : 'unknown',
      eventId: text(system.eventID, system.eventId, data.event_id, data.eventId),
      providerName: text(system.providerName),
      channel: text(system.channel),
      decoder: raw.decoder?.name,
      location: raw.location,
      applicationName,
      logonType: text(eventData.logonType),
      authenticationPackage: text(eventData.authenticationPackageName),
      status: text(eventData.status, data.status),
      subStatus: text(eventData.subStatus),
      destinationIp: text(eventData.destinationIp, data.dstip, data.destinationIp),
      sourcePort: integer(eventData.sourcePort ?? data.srcport ?? data.sourcePort),
      destinationPort: integer(eventData.destinationPort ?? data.dstport ?? data.destinationPort),
      protocol: text(eventData.protocol, data.protocol),
    },
  };
}

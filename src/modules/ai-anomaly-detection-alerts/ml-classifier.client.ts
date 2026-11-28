import { z } from 'zod';
import { env } from '../../config/env.js';
import type { DetectionEvent } from './anomaly-detection.repository.js';
import type { ContextEvent } from './detection-model.js';

// Validate the response returned by the separately deployed trained-model API.
const responseSchema = z
  .object({
    label: z.enum(['BENIGN', 'MALICIOUS_APT']),
    malicious: z.boolean(),
    score: z.number().finite(),
    threshold: z.number().finite(),
    escalationThreshold: z.number().finite(),
    scoreSemantics: z.string().min(1),
    modelVersion: z.string().min(1),
  })
  .strict();

export type MlPrediction = z.infer<typeof responseSchema>;
export type MlPredictionResult =
  | { status: 'PREDICTED'; prediction: MlPrediction }
  | { status: 'UNAVAILABLE'; reason: 'TIMEOUT' | 'NETWORK' | 'INVALID_RESPONSE' | 'HTTP_ERROR' };

type JsonRecord = Record<string, unknown>;

// Rolling event-time statistics sent with the current normalized event.
export interface MlTemporalContext {
  events1m: number;
  failures1m: number;
  events5m: number;
  failedLogins5m: number;
  accessDenials5m: number;
  vpnFailures5m: number;
  distinctAccounts5m: number;
  distinctSourceIps5m: number;
  successAfterFailure5m: boolean;
  secondsSincePrevious: number;
  events15m: number;
  failures15m: number;
  events60m: number;
  failures60m: number;
}

// Narrow untrusted JSON to an object or return an empty object.
function record(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

// Keep a non-empty string for the model payload.
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

// Convert a safe numeric value into the integer expected by the model.
function integerValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

// Convert boolean-like presence data into a model feature.
function booleanPresence(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && value.trim().length > 0;
}

// Build past-only 1/5/15/60-minute context for the same source and event family.
// The current event is counted, but future events and unrelated sources are excluded.
export function buildMlTemporalContext(
  event: DetectionEvent,
  history: readonly ContextEvent[],
): MlTemporalContext {
  const time = event.occurred_at.getTime();
  // Keep up to 60 minutes of past events from the same source and family.
  const eligible = history
    .filter(
      (item) =>
        item.id !== event.id &&
        item.event_source_id === event.event_source_id &&
        item.event_family === event.event_family &&
        item.occurred_at.getTime() <= time &&
        item.occurred_at.getTime() >= time - 60 * 60_000,
    )
    .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime());

  // Use the 5-minute window for detailed behavior features sent to ML.
  const prior = eligible.filter((item) => item.occurred_at.getTime() >= time - 5 * 60_000);
  const types = prior.map((item) => item.event_type.toUpperCase());
  const current = event.event_type.toUpperCase();
  const previous = prior.at(-1);
  const failures = new Set([
    'LOGIN_FAILURE',
    'LOGIN_FAILED',
    'VPN_LOGIN_FAILURE',
    'SSO_LOGIN_FAILURE',
  ]);
  const failureTypes = new Set([...failures, 'ACCESS_DENIED', 'APPLICATION_ACCESS_DENIED']);
  const context = [...prior, event];

  // The 1-, 15-, and 60-minute windows only need total events and failures.
  const summary = (minutes: number) => {
    const items = eligible.filter((item) => item.occurred_at.getTime() >= time - minutes * 60_000);
    return {
      events: items.length + 1,
      failures:
        items.filter((item) => failureTypes.has(item.event_type.toUpperCase())).length +
        Number(failureTypes.has(current)),
    };
  };
  const window1m = summary(1);
  const window15m = summary(15);
  const window60m = summary(60);
  return {
    events1m: window1m.events,
    failures1m: window1m.failures,
    events5m: prior.length + 1,
    failedLogins5m:
      types.filter((type) => ['LOGIN_FAILURE', 'LOGIN_FAILED'].includes(type)).length +
      Number(['LOGIN_FAILURE', 'LOGIN_FAILED'].includes(current)),
    accessDenials5m:
      types.filter((type) => ['ACCESS_DENIED', 'APPLICATION_ACCESS_DENIED'].includes(type)).length +
      Number(['ACCESS_DENIED', 'APPLICATION_ACCESS_DENIED'].includes(current)),
    vpnFailures5m:
      types.filter((type) => ['VPN_LOGIN_FAILURE', 'SSO_LOGIN_FAILURE'].includes(type)).length +
      Number(['VPN_LOGIN_FAILURE', 'SSO_LOGIN_FAILURE'].includes(current)),
    distinctAccounts5m: new Set(context.map((item) => item.account_identifier).filter(Boolean))
      .size,
    distinctSourceIps5m: new Set(context.map((item) => item.source_ip).filter(Boolean)).size,
    successAfterFailure5m: current.includes('SUCCESS') && types.some((type) => failures.has(type)),
    secondsSincePrevious: previous
      ? Math.min(3600, Math.max(0, (time - previous.occurred_at.getTime()) / 1000))
      : 3600,
    events15m: window15m.events,
    failures15m: window15m.failures,
    events60m: window60m.events,
    failures60m: window60m.failures,
  };
}

// Convert the normalized database event and temporal context into the
// camelCase JSON contract expected by POST /v1/predict in Train-Model.
export function buildMlPredictionPayload(
  event: DetectionEvent,
  temporal?: MlTemporalContext,
): JsonRecord {
  const payload = record(event.normalized_payload);
  const metadata = record(payload.metadata);
  const agent = record(payload.agent);
  const rule = record(payload.rule);
  const platform = stringValue(metadata.platform)?.toLowerCase();
  return {
    timestamp: event.occurred_at.toISOString(),
    eventFamily: event.event_family,
    eventType: event.event_type,
    eventId: stringValue(metadata.eventId) ?? stringValue(payload.rawEventId) ?? event.event_type,
    providerName:
      stringValue(metadata.providerName) ??
      (platform === 'windows' ? 'Microsoft-Windows-Security-Auditing' : undefined),
    channel: stringValue(metadata.channel),
    severityValue: event.severity ?? stringValue(rule.level),
    decoder: stringValue(metadata.decoder),
    location: stringValue(metadata.location) ?? stringValue(agent.name),
    inputType: event.event_family,
    logonType: stringValue(metadata.logonType) ?? integerValue(metadata.logonType),
    authenticationPackage: stringValue(metadata.authenticationPackage),
    integrityLevel: stringValue(metadata.integrityLevel),
    processPath: stringValue(metadata.processName),
    parentProcessPath: stringValue(metadata.parentProcessName),
    commandLinePresent: booleanPresence(metadata.commandLine),
    parentCommandLinePresent: booleanPresence(metadata.parentCommandLine),
    targetFilePresent: booleanPresence(metadata.targetFilename),
    hashesPresent: booleanPresence(metadata.hashes),
    sourceIp: event.source_ip ?? stringValue(payload.sourceIp),
    destinationIp: stringValue(metadata.destinationIp),
    sourcePort: integerValue(metadata.sourcePort),
    destinationPort: integerValue(metadata.destinationPort),
    protocol: stringValue(metadata.protocol),
    status: stringValue(metadata.status),
    subStatus: stringValue(metadata.subStatus),
    ...(temporal
      ? {
          events5m: temporal.events5m,
          failedLogins5m: temporal.failedLogins5m,
          accessDenials5m: temporal.accessDenials5m,
          vpnFailures5m: temporal.vpnFailures5m,
          distinctAccounts5m: temporal.distinctAccounts5m,
          distinctSourceIps5m: temporal.distinctSourceIps5m,
          successAfterFailure5m: temporal.successAfterFailure5m,
          secondsSincePrevious: temporal.secondsSincePrevious,
          events1m: temporal.events1m,
          failures1m: temporal.failures1m,
          events15m: temporal.events15m,
          failures15m: temporal.failures15m,
          events60m: temporal.events60m,
          failures60m: temporal.failures60m,
        }
      : {}),
  };
}

// Generate Anomaly Score: send one event and its temporal features to the
// self-trained model, then validate the returned score and escalation threshold.
export async function requestMlPrediction(
  event: DetectionEvent,
  options: { baseUrl?: string; timeoutMs?: number; temporalContext?: MlTemporalContext } = {},
): Promise<MlPredictionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? env.ML_MODEL_TIMEOUT_MS,
  );
  try {
    // ML_MODEL_BASE_URL points to the separate Train-Model FastAPI service.
    const response = await fetch(`${options.baseUrl ?? env.ML_MODEL_BASE_URL}/v1/predict`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Send the event fields and 1/5/15/60-minute evidence as JSON.
      body: JSON.stringify(buildMlPredictionPayload(event, options.temporalContext)),
      signal: controller.signal,
    });
    if (!response.ok) return { status: 'UNAVAILABLE', reason: 'HTTP_ERROR' };
    // Receive the ML score and validate its structure before returning it.
    const parsed = responseSchema.safeParse(await response.json());
    return parsed.success
      ? { status: 'PREDICTED', prediction: parsed.data }
      : { status: 'UNAVAILABLE', reason: 'INVALID_RESPONSE' };
  } catch (error: unknown) {
    return {
      status: 'UNAVAILABLE',
      reason: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK',
    };
  } finally {
    clearTimeout(timeout);
  }
}

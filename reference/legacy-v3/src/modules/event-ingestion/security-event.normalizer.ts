import { z } from 'zod';
import { isIP } from 'node:net';
import { AppError } from '../../common/errors/app-error.js';
import { logSourceConfigurationSchema } from './dto/log-source.dto.js';
import type { IngestSecurityEventsBody } from './dto/security-event.dto.js';

const severitySchema = z.enum(['low', 'medium', 'high', 'critical']);

export type NormalizedSecurityEvent = {
  externalEventId: string | null;
  eventType: string;
  severity: z.infer<typeof severitySchema> | null;
  eventTime: Date;
  sourceIp: string | null;
  destinationIp: string | null;
  rawPayload: IngestSecurityEventsBody['events'][number] | null;
  normalizedData: Record<string, string | null>;
};

const defaultPaths = {
  timestamp: 'timestamp',
  eventType: 'eventType',
  severity: 'severity',
  sourceIp: 'sourceIp',
  destinationIp: 'destinationIp',
  externalEventId: 'externalEventId',
} as const;

const readPath = (value: IngestSecurityEventsBody['events'][number], path: string): unknown => {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const optionalString = (value: unknown, name: string, maximum: number): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maximum) {
    throw new AppError(
      422,
      'INVALID_SECURITY_EVENT',
      `${name} must be a string of at most ${maximum} characters`,
    );
  }
  return value;
};

const eventDate = (value: unknown): Date => {
  const result = z
    .union([z.iso.datetime({ offset: true }), z.number().int().nonnegative()])
    .safeParse(value);
  if (!result.success) {
    throw new AppError(
      422,
      'INVALID_SECURITY_EVENT',
      'timestamp must be an ISO 8601 date-time or Unix milliseconds',
    );
  }
  const date = new Date(result.data);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(
      422,
      'INVALID_SECURITY_EVENT',
      'timestamp is outside the supported date range',
    );
  }
  return date;
};

export const normalizeSecurityEvents = (
  body: IngestSecurityEventsBody,
  configurationValue: unknown,
): NormalizedSecurityEvent[] => {
  const configuration = logSourceConfigurationSchema.safeParse(configurationValue);
  if (!configuration.success) {
    throw new AppError(
      409,
      'INVALID_LOG_SOURCE_CONFIGURATION',
      'Log source configuration is invalid',
    );
  }
  if (configuration.data.format !== 'json') {
    throw new AppError(
      409,
      'UNSUPPORTED_INGEST_FORMAT',
      'The HTTP ingestion endpoint accepts JSON log sources only',
    );
  }

  const mapping = configuration.data.fieldMapping;
  const paths = {
    timestamp: mapping?.timestamp ?? defaultPaths.timestamp,
    eventType: mapping?.eventType ?? defaultPaths.eventType,
    severity: mapping?.severity ?? defaultPaths.severity,
    sourceIp: mapping?.sourceIp ?? defaultPaths.sourceIp,
    destinationIp: mapping?.destinationIp ?? defaultPaths.destinationIp,
    externalEventId: mapping?.externalEventId ?? defaultPaths.externalEventId,
  };
  return body.events.map((rawEvent, index) => {
    const eventType = optionalString(readPath(rawEvent, paths.eventType), 'eventType', 100);
    if (!eventType?.trim()) {
      throw new AppError(422, 'INVALID_SECURITY_EVENT', `events[${index}].eventType is required`);
    }
    const severityValue = optionalString(readPath(rawEvent, paths.severity), 'severity', 20);
    const severity =
      severityValue === null ? null : severitySchema.safeParse(severityValue.toLowerCase());
    if (severity !== null && !severity.success) {
      throw new AppError(422, 'INVALID_SECURITY_EVENT', `events[${index}].severity is invalid`);
    }
    const sourceIp = optionalString(readPath(rawEvent, paths.sourceIp), 'sourceIp', 45);
    const destinationIp = optionalString(
      readPath(rawEvent, paths.destinationIp),
      'destinationIp',
      45,
    );
    if (sourceIp !== null && isIP(sourceIp) === 0) {
      throw new AppError(422, 'INVALID_SECURITY_EVENT', `events[${index}].sourceIp is invalid`);
    }
    if (destinationIp !== null && isIP(destinationIp) === 0) {
      throw new AppError(
        422,
        'INVALID_SECURITY_EVENT',
        `events[${index}].destinationIp is invalid`,
      );
    }
    const externalEventId = optionalString(
      readPath(rawEvent, paths.externalEventId),
      'externalEventId',
      255,
    );
    const eventTime = eventDate(readPath(rawEvent, paths.timestamp));
    const normalizedSeverity = severity === null ? null : severity.data;

    return {
      externalEventId,
      eventType: eventType.trim(),
      severity: normalizedSeverity,
      eventTime,
      sourceIp,
      destinationIp,
      rawPayload: configuration.data.collectRawPayload ? rawEvent : null,
      normalizedData: {
        externalEventId,
        eventType: eventType.trim(),
        severity: normalizedSeverity,
        eventTime: eventTime.toISOString(),
        sourceIp,
        destinationIp,
      },
    };
  });
};

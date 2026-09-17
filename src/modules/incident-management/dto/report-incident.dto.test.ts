import { describe, expect, it } from 'vitest';
import {
  classificationQueueQuerySchema,
  classifyIncidentBodySchema,
  assignIncidentBodySchema,
  reportIncidentBodySchema,
} from './report-incident.dto.js';
describe('reportIncidentBodySchema', () => {
  it('accepts a complete employee report', () =>
    expect(
      reportIncidentBodySchema.safeParse({
        title: 'Suspicious email received',
        description: 'The message requested my password and contained an unknown link.',
        category: 'phishing',
      }).success,
    ).toBe(true));
  it('rejects future occurrence times', () =>
    expect(
      reportIncidentBodySchema.safeParse({
        title: 'Suspicious email received',
        description: 'The message requested my password and contained an unknown link.',
        category: 'phishing',
        occurredAt: '2999-01-01T00:00:00.000Z',
      }).success,
    ).toBe(false));
});
describe('classificationQueueQuerySchema', () => {
  it('accepts bounded search and classification filters', () => {
    expect(
      classificationQueueQuerySchema.parse({
        search: 'INC-001',
        severity: 'high',
        status: 'reported',
        classification: 'unclassified',
      }),
    ).toMatchObject({ page: 1, limit: 10, classification: 'unclassified' });
  });
});
describe('classifyIncidentBodySchema', () => {
  it('accepts an approved severity with a rationale', () => {
    expect(
      classifyIncidentBodySchema.parse({
        severity: 'critical',
        rationale: 'Confirmed active compromise affecting privileged credentials.',
      }).severity,
    ).toBe('critical');
  });
  it('rejects unsupported severity and short rationale', () => {
    expect(
      classifyIncidentBodySchema.safeParse({ severity: 'urgent', rationale: 'bad' }).success,
    ).toBe(false);
  });
});
describe('assignIncidentBodySchema', () => {
  it('requires a valid user and documented assignment reason', () => {
    expect(
      assignIncidentBodySchema.safeParse({
        assigneeUserId: '22222222-2222-4222-8222-222222222222',
        note: 'Assign to the officer responsible for endpoint response.',
      }).success,
    ).toBe(true);
    expect(
      assignIncidentBodySchema.safeParse({ assigneeUserId: 'invalid', note: 'short' }).success,
    ).toBe(false);
  });
});

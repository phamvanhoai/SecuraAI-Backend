import { describe, expect, it } from 'vitest';
import { reportIncidentBodySchema } from './report-incident.dto.js';
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

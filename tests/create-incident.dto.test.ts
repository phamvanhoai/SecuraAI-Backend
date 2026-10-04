import { describe, expect, it } from 'vitest';

import { createIncidentFromSourceSchema } from '../src/modules/information-security-incident-management/dto/create-incident-from-source.dto.js';

const details = {
  title: 'Unauthorized visitor reported at server room',
  description: 'A security officer reported an unauthorized visitor without an existing alert.',
  severity: 'medium' as const,
};

describe('createIncidentFromSourceSchema', () => {
  it('accepts a manual incident without a source identifier', () => {
    expect(
      createIncidentFromSourceSchema.safeParse({ sourceType: 'manual', ...details }).success,
    ).toBe(true);
  });

  it('requires a source identifier for source-backed incidents', () => {
    expect(
      createIncidentFromSourceSchema.safeParse({ sourceType: 'finding', ...details }).success,
    ).toBe(false);
  });

  it('does not accept a source identifier on a manual incident', () => {
    const result = createIncidentFromSourceSchema.parse({
      sourceType: 'manual',
      sourceId: sourceId,
      ...details,
    });
    expect('sourceId' in result).toBe(false);
  });
});

const sourceId = 'b23cae8a-9c5c-42a1-984d-6850935f6b33';

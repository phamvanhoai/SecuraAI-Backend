import { describe, expect, it } from 'vitest';
import { createIncidentFromSourceSchema } from '../src/modules/information-security-incident-management/dto/create-incident-from-source.dto.js';

describe('createIncidentFromSourceSchema', () => {
  it('accepts complete incident details linked to a finding', () => {
    expect(
      createIncidentFromSourceSchema.safeParse({
        sourceType: 'finding',
        sourceId: 'b23cae8a-9c5c-42a1-984d-6850935f6b33',
        title: 'Confirmed privileged account compromise',
        description: 'The confirmed finding indicates unauthorized privileged account activity.',
        severity: 'high',
      }).success,
    ).toBe(true);
  });

  it('rejects incomplete incident details', () => {
    expect(
      createIncidentFromSourceSchema.safeParse({
        sourceType: 'alert',
        sourceId: 'not-a-uuid',
        title: 'Bad',
        description: 'Too short',
        severity: 'urgent',
      }).success,
    ).toBe(false);
  });
});

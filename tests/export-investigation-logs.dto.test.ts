import { describe, expect, it } from 'vitest';
import { exportInvestigationLogsSchema } from '../src/modules/notification-system-logs/dto/export-investigation-logs.dto.js';

describe('exportInvestigationLogsSchema', () => {
  it('accepts a filtered CSV export', () => {
    expect(
      exportInvestigationLogsSchema.parse({
        format: 'CSV',
        scope: 'FILTERED',
        reason: 'Reviewing authentication failures',
        filters: { status: 'FAILURE' },
      }),
    ).toMatchObject({ format: 'CSV', scope: 'FILTERED', selectedIds: [] });
  });

  it('requires selected IDs for selected scope', () => {
    expect(() =>
      exportInvestigationLogsSchema.parse({
        format: 'JSON',
        scope: 'SELECTED',
        reason: 'Reviewing selected security events',
      }),
    ).toThrow();
  });
});

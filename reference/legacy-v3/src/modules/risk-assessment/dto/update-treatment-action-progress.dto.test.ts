import { describe, expect, it } from 'vitest';
import { updateTreatmentActionProgressBodySchema } from './update-treatment-action-progress.dto.js';

const expectedUpdatedAt = '2026-09-21T02:00:00.000Z';

describe('updateTreatmentActionProgressBodySchema', () => {
  it('accepts progress boundaries and normalizes the note', () => {
    expect(
      updateTreatmentActionProgressBodySchema.parse({
        expectedUpdatedAt,
        progressPercent: 100,
        progressNote: '  Deployment evidence was verified.  ',
      }),
    ).toMatchObject({
      progressPercent: 100,
      progressNote: 'Deployment evidence was verified.',
    });
  });

  it.each([-1, 1.5, 101])('rejects invalid progress %s', (progressPercent) => {
    expect(() =>
      updateTreatmentActionProgressBodySchema.parse({ expectedUpdatedAt, progressPercent }),
    ).toThrow();
  });

  it('rejects unknown fields and short notes', () => {
    expect(() =>
      updateTreatmentActionProgressBodySchema.parse({
        expectedUpdatedAt,
        progressPercent: 50,
        progressNote: 'short',
      }),
    ).toThrow();
    expect(() =>
      updateTreatmentActionProgressBodySchema.parse({
        expectedUpdatedAt,
        progressPercent: 50,
        status: 'completed',
      }),
    ).toThrow();
  });
});

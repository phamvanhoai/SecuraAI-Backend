import { describe, expect, it } from 'vitest';
import { markAiAlertFurtherInvestigationSchema } from '../src/modules/ai-anomaly-detection-alerts/dto/mark-ai-alert-further-investigation.dto.js';

describe('mark AI alert further investigation DTO', () => {
  it('accepts and trims a meaningful reason', () => {
    expect(
      markAiAlertFurtherInvestigationSchema.parse({
        reason: '  Correlate this activity with endpoint telemetry.  ',
      }),
    ).toEqual({ reason: 'Correlate this activity with endpoint telemetry.' });
  });

  it('rejects missing, short, oversized, and unknown input', () => {
    expect(() => markAiAlertFurtherInvestigationSchema.parse({})).toThrow();
    expect(() => markAiAlertFurtherInvestigationSchema.parse({ reason: 'short' })).toThrow();
    expect(() =>
      markAiAlertFurtherInvestigationSchema.parse({ reason: 'x'.repeat(2001) }),
    ).toThrow();
    expect(() =>
      markAiAlertFurtherInvestigationSchema.parse({
        reason: 'Investigate this alert',
        force: true,
      }),
    ).toThrow();
  });
});

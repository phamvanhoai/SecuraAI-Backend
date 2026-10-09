import { describe, expect, it } from 'vitest';
import { assessControlEffectivenessBodySchema } from '../src/modules/policy-compliance-control/dto/assess-control-effectiveness.dto.js';
describe('assess control effectiveness contract', () => {
  it('accepts complete testing results', () => {
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        testMethod: 'Inspect configuration and sample access logs',
        result: 'effective',
        effectiveness: 92,
        notes: 'The control operated consistently throughout the sampled period.',
      }).success,
    ).toBe(true);
  });
  it('rejects invalid effectiveness', () => {
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        testMethod: 'Test',
        result: 'effective',
        effectiveness: 101,
        notes: 'A sufficiently detailed assessment note.',
      }).success,
    ).toBe(false);
  });
});

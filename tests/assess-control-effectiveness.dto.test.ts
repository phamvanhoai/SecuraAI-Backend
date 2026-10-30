import { describe, expect, it } from 'vitest';
import { assessControlEffectivenessBodySchema } from '../src/modules/policy-compliance-control/dto/assess-control-effectiveness.dto.js';
describe('assess control effectiveness contract', () => {
  it('requires a baseline and reason only when implementation changes', () => {
    const body = {
      testMethod: 'Inspect configuration',
      result: 'effective',
      effectiveness: 90,
      notes: 'Verified deployment through supporting evidence.',
    };
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        ...body,
        implementationStatus: 'implemented',
      }).success,
    ).toBe(false);
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        ...body,
        implementationStatus: 'implemented',
        expectedImplementationStatus: 'planned',
      }).success,
    ).toBe(false);
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        ...body,
        implementationStatus: 'implemented',
        expectedImplementationStatus: 'planned',
        implementationChangeReason: 'Deployment completed across the intended scope.',
      }).success,
    ).toBe(true);
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        ...body,
        implementationStatus: 'planned',
        expectedImplementationStatus: 'planned',
      }).success,
    ).toBe(true);
  });
  it.each([
    [0, 'ineffective'],
    [49.99, 'ineffective'],
    [50, 'partially_effective'],
    [79.99, 'partially_effective'],
    [80, 'effective'],
    [100, 'effective'],
  ])('accepts boundary %s as %s', (effectiveness, result) => {
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        testMethod: 'Inspect access logs',
        notes: 'Verified test scope and supporting evidence.',
        effectiveness,
        result,
      }).success,
    ).toBe(true);
  });
  it.each([
    [0, 'effective'],
    [100, 'ineffective'],
    [50, 'effective'],
    [80, 'partially_effective'],
  ])('rejects mismatch %s and %s', (effectiveness, result) => {
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        testMethod: 'Inspect access logs',
        notes: 'Verified test scope and supporting evidence.',
        effectiveness,
        result,
      }).success,
    ).toBe(false);
  });
  it('rejects excess precision that could round across a result threshold', () => {
    expect(
      assessControlEffectivenessBodySchema.safeParse({
        testMethod: 'Inspect access logs',
        notes: 'Verified test scope and supporting evidence.',
        effectiveness: 79.999,
        result: 'partially_effective',
      }).success,
    ).toBe(false);
  });
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

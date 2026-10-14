import { describe, expect, it } from 'vitest';
import { classifyAssetBodySchema } from '../src/modules/it-asset-management/dto/classify-asset.dto.js';

describe('classifyAssetBodySchema', () => {
  it.each(['', ' '.repeat(30), 'short', 'x'.repeat(2001)])('rejects missing or invalid separate data classification basis', (dataClassificationBasis) => {
    expect(classifyAssetBodySchema.safeParse({ confidentialityImpact: 1, integrityImpact: 1, availabilityImpact: 5, businessImpact: 1, dataClassification: 'public', rationale: 'An outage stops essential operations.', dataClassificationBasis }).success).toBe(false);
  });
  const valid = {
    confidentialityImpact: 5,
    integrityImpact: 4,
    availabilityImpact: 5,
    businessImpact: 4,
    dataClassification: 'restricted',
    dataClassificationBasis: 'Only approved public information is handled; no sensitive records are stored.',
    rationale: 'Disclosure of customer records would cause severe business harm.',
  };

  it('accepts bounded impact scores and a supported data classification', () => {
    expect(classifyAssetBodySchema.parse(valid)).toEqual(valid);
  });

  it.each([0, 6, 2.5])('rejects invalid impact score %s', (confidentialityImpact) => {
    expect(classifyAssetBodySchema.safeParse({ ...valid, confidentialityImpact }).success).toBe(
      false,
    );
  });
  it.each(['', ' '.repeat(30), 'short', 'x'.repeat(2001)])(
    'requires a bounded meaningful basis',
    (rationale) => {
      expect(classifyAssetBodySchema.safeParse({ ...valid, rationale }).success).toBe(false);
    },
  );
});

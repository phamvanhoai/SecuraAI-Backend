import { describe, expect, it } from 'vitest';
import { classifyAssetBodySchema } from '../src/modules/it-asset-management/dto/classify-asset.dto.js';

describe('classifyAssetBodySchema', () => {
  const valid = { confidentialityImpact: 5, integrityImpact: 4, availabilityImpact: 5, businessImpact: 4, dataClassification: 'restricted' };

  it('accepts bounded impact scores and a supported data classification', () => {
    expect(classifyAssetBodySchema.parse(valid)).toEqual(valid);
  });

  it.each([0, 6, 2.5])('rejects invalid impact score %s', (confidentialityImpact) => {
    expect(classifyAssetBodySchema.safeParse({ ...valid, confidentialityImpact }).success).toBe(false);
  });
});

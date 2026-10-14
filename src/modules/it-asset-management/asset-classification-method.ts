import type { ClassifyAssetInput } from './dto/classify-asset.dto.js';

// Internal extension inspired by FIPS PUB 199 (2004), Section 3; not a FIPS category.
export const ASSET_CLASSIFICATION_METHOD = 'SECURAAI-ASSET-IMPACT-v1';
export function calculateAssetCriticality(
  input: Pick<
    ClassifyAssetInput,
    'confidentialityImpact' | 'integrityImpact' | 'availabilityImpact' | 'businessImpact'
  >,
): { score: number; criticality: 'low' | 'medium' | 'high' | 'critical' } {
  const score = Math.max(
    input.confidentialityImpact,
    input.integrityImpact,
    input.availabilityImpact,
    input.businessImpact,
  );
  return {
    score,
    criticality: score === 5 ? 'critical' : score === 4 ? 'high' : score >= 2 ? 'medium' : 'low',
  };
}

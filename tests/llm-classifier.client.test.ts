import { describe, expect, it } from 'vitest';
import { canonicalSecurityCategory } from '../src/modules/ai-anomaly-detection-alerts/llm-classifier.client.js';

describe('canonicalSecurityCategory', () => {
  it.each([
    ['AUTHENTICATION', 'AUTHENTICATION'],
    ['VPN_SSO', 'VPN_SSO'],
    ['APPLICATION_ACCESS', 'APPLICATION_ACCESS'],
  ] as const)('keeps normalized %s events in their authoritative family', (family, expected) => {
    expect(canonicalSecurityCategory(family)).toBe(expected);
  });
});

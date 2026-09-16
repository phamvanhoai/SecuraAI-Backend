import { describe, expect, it } from 'vitest';
import {
  listPolicyControlMappingsQuerySchema,
  replacePolicyControlMappingsBodySchema,
} from '../src/modules/policy-compliance/dto/map-controls.dto.js';

const controlId = '00000000-0000-4000-8000-000000000001';

describe('policy control mapping DTOs', () => {
  it('applies bounded list defaults', () => {
    expect(listPolicyControlMappingsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(() => listPolicyControlMappingsQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it('rejects duplicate controls and long notes', () => {
    expect(() =>
      replacePolicyControlMappingsBodySchema.parse({
        mappings: [{ controlId }, { controlId }],
      }),
    ).toThrow();
    expect(() =>
      replacePolicyControlMappingsBodySchema.parse({
        mappings: [{ controlId, notes: 'x'.repeat(1001) }],
      }),
    ).toThrow();
  });
});

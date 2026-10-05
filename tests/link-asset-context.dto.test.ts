import { describe, expect, it } from 'vitest';
import { linkAssetContextBodySchema } from '../src/modules/it-asset-management/dto/link-asset-context.dto.js';
const id = '11111111-1111-4111-8111-111111111111';
describe('linkAssetContextBodySchema', () => {
  it('accepts a nullable service and bounded relationship IDs', () => expect(linkAssetContextBodySchema.safeParse({ businessServiceId: null, dependencyIds: [id], eventSourceIds: [] }).success).toBe(true));
  it('rejects duplicate relationships', () => expect(linkAssetContextBodySchema.safeParse({ businessServiceId: null, dependencyIds: [id, id], eventSourceIds: [] }).success).toBe(false));
});

import { describe, expect, it } from 'vitest';
import { listEvidenceAssessmentsQuerySchema, uploadEvidenceBodySchema } from './compliance-evidence.dto.js';
describe('compliance evidence DTOs', () => {
  it('applies bounded pagination defaults', () => { expect(listEvidenceAssessmentsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 }); expect(() => listEvidenceAssessmentsQuerySchema.parse({ limit: 51 })).toThrow(); });
  it('normalizes optional upload metadata', () => { expect(uploadEvidenceBodySchema.parse({ description: '', validUntil: '' })).toEqual({ description: null, validUntil: null }); expect(uploadEvidenceBodySchema.parse({ validUntil: '2026-12-31' }).validUntil).toBe('2026-12-31'); });
  it('rejects evidence validity in the past', () => { expect(() => uploadEvidenceBodySchema.parse({ validUntil: '2020-01-01' })).toThrow(); });
});

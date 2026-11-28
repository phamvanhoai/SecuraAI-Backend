import { describe, expect, it } from 'vitest';
import { runRetentionPurgeBodySchema } from '../src/modules/event-ingestion/dto/retention-purge.dto.js';

describe('retention purge DTO validation', () => {
  it('defaults dryRun to false when body is omitted or empty', () => {
    expect(runRetentionPurgeBodySchema.parse(undefined)).toEqual({ dryRun: false });
    expect(runRetentionPurgeBodySchema.parse({})).toEqual({ dryRun: false });
  });

  it('accepts valid dryRun, eventFamily, batchSize, and maxBatches', () => {
    const parsed = runRetentionPurgeBodySchema.parse({
      dryRun: true,
      eventFamily: 'AUTHENTICATION',
      batchSize: 500,
      maxBatches: 25,
    });

    expect(parsed).toEqual({
      dryRun: true,
      eventFamily: 'AUTHENTICATION',
      batchSize: 500,
      maxBatches: 25,
    });
  });

  it('rejects out-of-range batchSize and maxBatches', () => {
    expect(() => runRetentionPurgeBodySchema.parse({ batchSize: 9 })).toThrow();
    expect(() => runRetentionPurgeBodySchema.parse({ batchSize: 1001 })).toThrow();
    expect(() => runRetentionPurgeBodySchema.parse({ maxBatches: 0 })).toThrow();
    expect(() => runRetentionPurgeBodySchema.parse({ maxBatches: 101 })).toThrow();
  });

  it('rejects invalid eventFamily and unexpected keys', () => {
    expect(() => runRetentionPurgeBodySchema.parse({ eventFamily: 'UNKNOWN' })).toThrow();
    expect(() => runRetentionPurgeBodySchema.parse({ extraField: true })).toThrow();
  });
});

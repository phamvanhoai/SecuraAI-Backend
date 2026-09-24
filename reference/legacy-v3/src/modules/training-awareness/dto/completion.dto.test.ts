import { describe, expect, it } from 'vitest';
import {
  completionCampaignsQuerySchema,
  completionEnrollmentsQuerySchema,
} from './completion.dto.js';

describe('training completion queries', () => {
  it('applies bounded defaults', () => {
    expect(completionCampaignsQuerySchema.parse({})).toEqual({ page: 1, limit: 10, q: '' });
    expect(completionEnrollmentsQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      q: '',
      status: 'all',
    });
  });

  it('rejects unsupported enrollment statuses', () => {
    expect(completionEnrollmentsQuerySchema.safeParse({ status: 'unknown' }).success).toBe(false);
  });
});

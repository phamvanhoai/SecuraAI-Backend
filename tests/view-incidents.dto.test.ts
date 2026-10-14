import { describe, expect, it } from 'vitest';
import {
  incidentDetailParamsSchema,
  viewIncidentsQuerySchema,
} from '../src/modules/information-security-incident-management/dto/view-incidents.dto.js';

describe('view incidents DTOs', () => {
  it('applies pagination defaults', () => {
    expect(viewIncidentsQuerySchema.parse({})).toEqual({ page: 1, limit: 10 });
  });

  it('normalizes bounded filters', () => {
    expect(
      viewIncidentsQuerySchema.parse({
        page: '2',
        limit: '20',
        search: ' malware ',
        severity: 'high',
        status: 'containment',
      }),
    ).toEqual({
      page: 2,
      limit: 20,
      search: 'malware',
      severity: 'high',
      status: 'containment',
    });
  });

  it('rejects invalid status and incident identifiers', () => {
    expect(() => viewIncidentsQuerySchema.parse({ status: 'resolved' })).toThrow();
    expect(() => incidentDetailParamsSchema.parse({ incidentId: 'invalid' })).toThrow();
  });
});

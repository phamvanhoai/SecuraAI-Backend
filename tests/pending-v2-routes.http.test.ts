import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/database/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }));

import { createApp } from '../src/app.js';
import { openApiSpec } from '../src/docs/openapi.js';
import { legacyV1RouteContracts } from '../src/routes/legacy-v1-route-contracts.js';

describe('historical V1 URL contracts', () => {
  const app = createApp();

  it('exposes every pending operation as HTTP 501 and documents its real status', async () => {
    expect(legacyV1RouteContracts.length).toBe(138);
    for (const route of legacyV1RouteContracts) {
      const path = route.path.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000000');
      const response = await request(app)[route.method](`/api/v1${path}`);
      expect(response.status, `${route.method.toUpperCase()} ${route.path}`).toBe(501);
      expect(response.body.error.code).toBe('ENDPOINT_NOT_IMPLEMENTED');
      expect(openApiSpec.paths).toMatchObject({
        [route.path]: {
          [route.method]: {
            'x-implementation-status': 'pending-v2-migration',
            responses: { '501': expect.any(Object) },
          },
        },
      });
    }
  });
});

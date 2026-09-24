import { legacyV1RouteContracts } from '../routes/legacy-v1-route-contracts.js';

type PendingOperation = {
  tags: string[];
  summary: string;
  description: string;
  parameters: { name: string; in: string; required: boolean; schema: { type: string } }[];
  responses: { '501': { description: string } };
  'x-implementation-status': string;
};

export const pendingV2Paths: Record<string, Record<string, PendingOperation>> = {};

for (const route of legacyV1RouteContracts) {
  const parameters = [...route.path.matchAll(/\{([^}]+)\}/g)].flatMap((match) =>
    match[1] ? [{ name: match[1], in: 'path', required: true, schema: { type: 'string' } }] : [],
  );
  const operations = (pendingV2Paths[route.path] ??= {});
  operations[route.method] = {
    tags: [route.tag],
    summary: `Pending V2 migration: ${route.method.toUpperCase()} ${route.path}`,
    description: 'Historical V1 URL reserved for porting. It currently returns HTTP 501 and does not execute legacy database code.',
    parameters,
    responses: { '501': { description: 'Endpoint not yet implemented for the V2 database' } },
    'x-implementation-status': 'pending-v2-migration',
  };
}

const pagination = {
  type: 'object',
  required: ['page', 'limit', 'total', 'totalPages'],
  properties: {
    page: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  },
};
const service = {
  type: 'object',
  required: [
    'id',
    'name',
    'description',
    'status',
    'owner',
    'linkedAssetsCount',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['active', 'inactive'] },
    owner: {
      type: 'object',
      nullable: true,
      required: ['id', 'fullName', 'inactive'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        fullName: { type: 'string' },
        inactive: { type: 'boolean' },
      },
    },
    linkedAssetsCount: {
      type: 'integer',
      minimum: 0,
      description: 'All currently linked assets, including archived assets.',
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
const pageParameters = [
  {
    name: 'page',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
  },
  {
    name: 'limit',
    in: 'query',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
  },
];
const idParameter = {
  name: 'serviceId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const errors = {
  '401': { description: 'Authentication required or account inactive' },
  '403': { description: 'Active Security Officer required' },
  '422': { description: 'Invalid query or UUID' },
};
function success(schema: object) {
  return {
    description: 'Successful result',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'data'],
          properties: { success: { type: 'boolean', enum: [true] }, data: schema },
        },
      },
    },
  };
}
export const businessServicesPaths = {
  '/business-services/{serviceId}/deactivation-check': {
    get: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'Check business service deactivation eligibility',
      description:
        'Active Security Officer only. Consistent read-only snapshot, not a reservation. Counts Active assets and directly scoped Risks except Closed/Archived; Accepted still blocks. No asset-snapshot changes. POST rechecks all conditions atomically.',
      parameters: [idParameter],
      responses: {
        ...errors,
        '404': { description: 'Service not found' },
        '200': success({
          type: 'object',
          required: ['service', 'activeAssetsCount', 'unresolvedRisksCount', 'canDeactivate'],
          properties: {
            service,
            activeAssetsCount: { type: 'integer', minimum: 0 },
            unresolvedRisksCount: { type: 'integer', minimum: 0 },
            canDeactivate: { type: 'boolean' },
          },
        }),
      },
    },
  },
  '/business-services/{serviceId}/deactivate': {
    post: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'Deactivate an unused business service',
      description:
        'Active Security Officer only (business-services.deactivate discovery capability). Requires loaded expectedUpdatedAt, current case-sensitive name (whitespace normalized), and nonblank reason. Blocks Active assets and directly scoped Risks unless Closed/Archived; Accepted is not terminal. Serializable transaction rechecks actor, version, status and usage, sets only status INACTIVE, and writes BUSINESS_SERVICE_DEACTIVATED audit with actor/time/reason atomically. Concurrent link/create/version changes return 409 without automatic retry. Already inactive returns 409; no repeated audit. Retains Archived Asset/terminal Risk links, ownership, metadata, service identity, Risk scopes and snapshots. No deletion, cascading changes, reactivation or new schema. Existing option APIs already disallow new inactive service selection.',
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['expectedUpdatedAt', 'confirmationName', 'reason'],
              properties: {
                expectedUpdatedAt: { type: 'string', format: 'date-time' },
                confirmationName: { type: 'string', minLength: 1, maxLength: 255 },
                reason: { type: 'string', minLength: 1, maxLength: 2000 },
              },
            },
          },
        },
      },
      responses: {
        ...errors,
        '200': success(service),
        '404': { description: 'Service not found' },
        '409': {
          description:
            'BUSINESS_SERVICE_IN_USE (usage counts in error.details), BUSINESS_SERVICE_STALE, or BUSINESS_SERVICE_INACTIVE. Nothing changed by the rejected transaction.',
        },
        '422': {
          description: 'Invalid body, version, UUID or BUSINESS_SERVICE_CONFIRMATION_MISMATCH',
        },
      },
    },
  },
  '/business-services/owner-options': {
    get: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'Search active responsible owners for service creation',
      description:
        'Active Security Officer required. At most 10 active users, ordered by fullName/id. Owner assignment does not grant authorization. All fixed roles may be responsible owners; no new role is introduced.',
      parameters: [{ name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } }],
      responses: {
        ...errors,
        '200': success({
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              maxItems: 10,
              items: {
                type: 'object',
                required: ['id', 'fullName', 'role'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  fullName: { type: 'string' },
                  role: {
                    type: 'string',
                    enum: ['ADMIN', 'SECURITY_OFFICER', 'EMPLOYEE', 'EXECUTIVE'],
                  },
                },
              },
            },
          },
        }),
      },
    },
  },
  '/business-services': {
    post: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'Create an Active business service',
      description:
        'Active Security Officer required (business-services.create discovery capability). Name is trimmed and whitespace normalized; case-insensitive duplicates including inactive services are rejected. Optional owner must be active, rechecked and row-locked with actor inside the transaction. Creation and BUSINESS_SERVICE_CREATED audit are atomic. Serializes this API creation path to avoid concurrent duplicate names; direct DB writes are outside this guard. Does not link assets or modify existing Risks. No automatic retry on ambiguous failures.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['name'],
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 255 },
                description: { type: 'string', nullable: true, maxLength: 5000 },
                ownerUserId: { type: 'string', format: 'uuid', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        ...errors,
        '201': success(service),
        '409': { description: 'Normalized name already exists' },
      },
    },
    get: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'List and search business services',
      description:
        'Active Security Officer only (business-services.read discovery capability). Search name, description or owner, case-insensitively. Includes inactive services by default. Stable name/id ascending order. No writes or risk-scope synchronization.',
      parameters: [
        ...pageParameters,
        { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive'] } },
      ],
      responses: {
        ...errors,
        '200': success({
          type: 'object',
          required: ['items', 'pagination'],
          properties: { items: { type: 'array', items: service }, pagination },
        }),
      },
    },
  },
  '/business-services/{serviceId}': {
    patch: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'Edit Active business service metadata',
      description:
        'Active Security Officer only. Only name, description and ownerUserId are editable. Omitted fields retain existing values; null removes description/owner. Name validation and global Create/Edit duplicate-name guard are shared. New owners must be active; existing inactive owner may remain unchanged. Service row is locked and expectedUpdatedAt must match the loaded version. Inactive services are read-only. No-op does not change timestamp or write audit. Changed fields and actor are audited atomically. Asset membership and existing Risk scope/ratings/owners are never changed. Rename is for metadata correction, not repurposing a service.',
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['expectedUpdatedAt'],
              properties: {
                expectedUpdatedAt: { type: 'string', format: 'date-time' },
                name: { type: 'string', minLength: 1, maxLength: 255 },
                description: { type: 'string', nullable: true, maxLength: 5000 },
                ownerUserId: { type: 'string', format: 'uuid', nullable: true },
              },
              description: 'At least one editable field is required.',
            },
          },
        },
      },
      responses: {
        ...errors,
        '200': success(service),
        '404': { description: 'Service not found' },
        '409': {
          description:
            'BUSINESS_SERVICE_STALE, BUSINESS_SERVICE_INACTIVE or BUSINESS_SERVICE_NAME_EXISTS. No write performed.',
        },
      },
    },
    get: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'View business service details',
      description:
        'Active Security Officer only. Inactive services remain readable. Owner inactivity is explicit; linkedAssetsCount includes archived assets. Does not change Link Asset Context or historical Risk scope.',
      parameters: [idParameter],
      responses: {
        ...errors,
        '404': { description: 'Business service not found' },
        '200': success(service),
      },
    },
  },
  '/business-services/{serviceId}/assets': {
    get: {
      tags: ['IT Asset Management'],
      security: [{ bearerAuth: [] }],
      summary: 'View paginated assets currently linked to a service',
      description:
        'Active Security Officer only. Includes archived assets for review; stable assetCode/id ascending order. This is current asset membership, not an existing Risk asset snapshot.',
      parameters: [idParameter, ...pageParameters],
      responses: {
        ...errors,
        '404': { description: 'Business service not found' },
        '200': success({
          type: 'object',
          required: ['items', 'pagination'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'assetCode', 'name', 'assetType', 'status'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  assetCode: { type: 'string' },
                  name: { type: 'string' },
                  assetType: { type: 'string' },
                  status: { type: 'string', enum: ['active', 'archived'] },
                },
              },
            },
            pagination,
          },
        }),
      },
    },
  },
};

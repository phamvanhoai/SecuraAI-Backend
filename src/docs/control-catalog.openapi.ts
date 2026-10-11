const fields = {
  name: { type: 'string', minLength: 3, maxLength: 255 },
  description: { type: 'string', minLength: 10, maxLength: 5000 },
  ownerUserId: {
    type: 'string',
    format: 'uuid',
    nullable: true,
    description:
      'Active Employee or Security Officer; null means unassigned. Edit may retain an unchanged inactive owner.',
  },
  applicability: { type: 'string', enum: ['applicable', 'not_applicable', 'under_review'] },
  implementationStatus: {
    type: 'string',
    enum: ['not_implemented', 'planned', 'partially_implemented', 'implemented'],
  },
};
const record = {
  type: 'object',
  required: [
    'id',
    'controlCode',
    'name',
    'description',
    'owner',
    'applicability',
    'implementationStatus',
    'createdAt',
    'updatedAt',
    'revision',
    'configurationLocked',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    controlCode: { type: 'string' },
    name: fields.name,
    applicability: fields.applicability,
    implementationStatus: fields.implementationStatus,
    description: { type: 'string', nullable: true },
    owner: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string', format: 'uuid' },
        fullName: { type: 'string' },
        status: { type: 'string' },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    revision: {
      type: 'string',
      pattern: '^[a-f0-9]{64}$',
      description: 'Opaque revision preserving database timestamp precision and assessment state.',
    },
    configurationLocked: { type: 'boolean' },
  },
};
const security = [{ bearerAuth: [] }];
const failure = {
  '401': { description: 'Active authenticated account required' },
  '403': { description: 'Security Officer required, regardless of JWT role claims' },
  '422': { description: 'Invalid or unknown fields; new owner must be active and eligible' },
};
const response = {
  description: 'Security control metadata. No risk, evidence or assessment is created or changed.',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { success: { type: 'boolean', enum: [true] }, data: record },
      },
    },
  },
};
const parameter = [
  { name: 'controlId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
];
export const controlCatalogPaths = {
  '/compliance/controls': {
    post: {
      tags: ['Controls'],
      summary: 'Create a reusable security control',
      security,
      description:
        'Security Officer only. Code is normalized to uppercase and unique case-insensitively. Control and audit are atomic. No automatic Risk link or effectiveness result.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['controlCode', ...Object.keys(fields)],
              properties: {
                controlCode: {
                  type: 'string',
                  minLength: 3,
                  maxLength: 100,
                  pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$',
                },
                ...fields,
              },
            },
          },
        },
      },
      responses: {
        '201': response,
        '409': { description: 'Control code already exists' },
        ...failure,
      },
    },
  },
  '/compliance/controls/{controlId}': {
    get: {
      tags: ['Controls'],
      summary: 'Load the current Control Edit baseline',
      security,
      parameters: parameter,
      responses: { '200': response, '404': { description: 'Control not found' }, ...failure },
    },
    patch: {
      tags: ['Controls'],
      summary: 'Edit security control metadata',
      security,
      parameters: parameter,
      description:
        'Immutable code. Reason and exact baseline revision required. Applicability and implementation cannot change once any assessment exists. Existing evidence, assessments and links remain intact. A no-op does not update timestamp or add an audit.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: [...Object.keys(fields), 'expectedUpdatedAt', 'expectedRevision', 'reason'],
              properties: {
                ...fields,
                expectedUpdatedAt: { type: 'string', format: 'date-time' },
                expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
                reason: { type: 'string', minLength: 10, maxLength: 2000 },
              },
            },
          },
        },
      },
      responses: {
        '200': response,
        '404': { description: 'Control not found' },
        '409': {
          description: 'Stale revision or assessed configuration is locked; reload the baseline',
        },
        ...failure,
      },
    },
  },
  '/compliance/controls/owner-options': {
    get: {
      tags: ['Controls'],
      summary: 'Search eligible active Control Owners (maximum 10)',
      security,
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100, default: '' } },
      ],
      responses: {
        '200': {
          description:
            '{success:true,data:{items:[{id,fullName}]}}; active Employees and Security Officers, ordered by name and ID; maximum 10 results',
        },
        ...failure,
      },
    },
  },
};

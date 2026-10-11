const security = [{ bearerAuth: [] }];
const parameters = [
  { name: 'controlId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
];
const person = {
  type: 'object',
  nullable: true,
  properties: { id: { type: 'string', format: 'uuid' }, fullName: { type: 'string' } },
};
const date = { type: 'string', format: 'date-time' };
const evidence = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    source: { type: 'string' },
    description: { type: 'string', nullable: true },
    documentUrl: {
      type: 'string',
      format: 'uri',
      nullable: true,
      description:
        'Supported HTTPS reference only; unsafe/unsupported legacy storage URIs are not exposed. Never fetched by SecuraAI.',
    },
    status: { type: 'string', enum: ['active', 'expired', 'invalid', 'archived'] },
    usable: {
      type: 'boolean',
      description:
        'Active, already collected, inside optional validity period; does not assert review or document authenticity.',
    },
    collectedAt: date,
    validFrom: { ...date, nullable: true },
    validUntil: { ...date, nullable: true },
    owner: person,
    reviewedAt: { ...date, nullable: true },
    reviewedBy: person,
    createdAt: date,
  },
};
const errors = {
  '401': { description: 'Active authenticated account required' },
  '403': {
    description:
      'Active Security Officer or assigned Employee Control Owner required; checked inside the transaction',
  },
  '404': {
    description:
      'Control missing or Evidence missing/inaccessible (no evidence existence disclosure)',
  },
  '409': {
    description:
      'Evidence expired/not yet valid, duplicate document/version, requestId mismatch or concurrent state change; refresh saved records before retrying',
  },
  '422': {
    description:
      'Strict input validation, future collection, invalid/expired validity or missing relevance reason',
  },
};
const envelope = (data: object) => ({
  type: 'object',
  properties: { success: { type: 'boolean', enum: [true] }, data },
});
const json = (schema: object) => ({ 'application/json': { schema } });
const addResult = { type: 'object', properties: { evidence, created: { type: 'boolean' } } };
const linkResult = { type: 'object', properties: { evidence, linked: { type: 'boolean' } } };
export const controlEvidencePaths = {
  '/compliance/controls/{controlId}/evidence': {
    get: {
      tags: ['Controls'],
      summary: 'List linked Evidence or accessible candidates (maximum 10 per page)',
      security,
      description:
        'Linked view preserves all statuses for review/history. Available view excludes linked pairs, inactive, expired and future-valid evidence. Employee candidates are evidence they own or linked to Controls they currently own; Security Officers can see all. Document references remain subject to external repository permissions.',
      parameters: [
        ...parameters,
        {
          name: 'view',
          in: 'query',
          schema: { type: 'string', enum: ['linked', 'available'], default: 'linked' },
        },
        {
          name: 'q',
          in: 'query',
          schema: { type: 'string', maxLength: 100, default: '' },
          description: 'Case-insensitive name/source search',
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 10, default: 10 },
        },
      ],
      responses: {
        '200': {
          description: 'Ownership-scoped page with action state',
          content: json(
            envelope({
              type: 'object',
              properties: {
                control: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    controlCode: { type: 'string' },
                    name: { type: 'string' },
                  },
                },
                canAdd: { type: 'boolean' },
                canLink: { type: 'boolean' },
                items: {
                  type: 'array',
                  maxItems: 10,
                  items: {
                    ...evidence,
                    properties: {
                      ...evidence.properties,
                      linkedAt: { ...date, nullable: true },
                      linkedBy: person,
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                    totalPages: { type: 'integer' },
                  },
                },
              },
            }),
          ),
        },
        ...errors,
      },
    },
    post: {
      tags: ['Controls'],
      summary: 'Register a new HTTPS Evidence reference and link it atomically',
      security,
      parameters,
      description:
        'Evidence owner/linker is the actor. Status starts Active; review fields, file size/MIME/hash remain unset (no uploaded file). Collection must not be in the future; optional expiry must be strictly after collection and now. Replaying the same requestId, Control and body returns the saved record without duplicate link/audit; changed body is rejected. Duplicate accessible document URL + collection time is rejected with guidance to reuse. Does not alter assessment history or any Risk state.',
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          additionalProperties: false,
          required: [
            'requestId',
            'name',
            'source',
            'description',
            'documentUrl',
            'collectedAt',
            'validUntil',
          ],
          properties: {
            requestId: {
              type: 'string',
              format: 'uuid',
              description:
                'Stable unique ID for this Add attempt; reused only for an identical replay.',
            },
            name: { type: 'string', minLength: 3, maxLength: 255 },
            source: { type: 'string', minLength: 3, maxLength: 255 },
            description: { type: 'string', minLength: 10, maxLength: 5000 },
            documentUrl: {
              type: 'string',
              format: 'uri',
              maxLength: 2048,
              description:
                'HTTPS only, no embedded credentials, whitespace or control characters; do not include secrets or expiring access tokens.',
            },
            collectedAt: date,
            validUntil: { ...date, nullable: true },
          },
        }),
      },
      responses: {
        '201': {
          description: 'Evidence/reference, link and audit created together',
          content: json(envelope(addResult)),
        },
        '200': {
          description: 'Identical request already saved (created=false)',
          content: json(envelope(addResult)),
        },
        ...errors,
      },
    },
  },
  '/compliance/controls/{controlId}/evidence-links': {
    post: {
      tags: ['Controls'],
      summary: 'Link existing accessible, eligible Evidence without duplicating it',
      security,
      parameters,
      description:
        'Additive only: no unlink/delete/edit. Rechecks actor, current target Control ownership, source Evidence access and validity inside a Serializable transaction. Linking shares metadata/reference with authorized users of the target Control, not external repository permission. Already-linked pair is a no-op (no duplicate audit). Does not mark reviewed or change Control effectiveness/Risk.',
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          additionalProperties: false,
          required: ['evidenceId', 'reason'],
          properties: {
            evidenceId: { type: 'string', format: 'uuid' },
            reason: {
              type: 'string',
              minLength: 10,
              maxLength: 2000,
              description: 'Why the existing evidence supports this Control; recorded in audit.',
            },
          },
        }),
      },
      responses: {
        '201': {
          description: 'Link/audit appended; evidence reused',
          content: json(envelope(linkResult)),
        },
        '200': {
          description: 'Already linked (linked=false); no extra audit',
          content: json(envelope(linkResult)),
        },
        ...errors,
      },
    },
  },
};

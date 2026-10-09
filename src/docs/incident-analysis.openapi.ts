const actor = {
  type: 'object',
  required: ['id', 'name'],
  properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
};
const findings = {
  type: 'object',
  required: ['rootCause', 'lessonsLearned', 'improvementActions'],
  properties: {
    rootCause: { type: 'string', nullable: true },
    lessonsLearned: { type: 'string', nullable: true },
    improvementActions: { type: 'string', nullable: true },
  },
};
const analysis = {
  type: 'object',
  required: [
    'id',
    'rootCause',
    'lessonsLearned',
    'improvementActions',
    'analyzedAt',
    'analyzedBy',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    ...findings.properties,
    id: { type: 'string', format: 'uuid' },
    analyzedAt: { type: 'string', format: 'date-time' },
    analyzedBy: actor,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
const id = {
  name: 'incidentId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const errors = {
  '401': { description: 'Active authenticated account required' },
  '403': { description: 'Incident viewing or Security Officer permission required' },
  '404': { description: 'Incident not found' },
  '422': { description: 'Invalid UUID, body or pagination' },
};
const envelope = (data: object) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: { success: { type: 'boolean', enum: [true] }, data },
});
const response = (schema: object) => ({
  description: 'Success',
  content: { 'application/json': { schema: envelope(schema) } },
});
export const incidentAnalysisPaths = {
  '/incidents/{incidentId}/analysis': {
    get: {
      tags: ['Incident Management'],
      summary: 'View current root cause analysis',
      description:
        'Active Security Officers and Executives can read. canEdit is true only for Security Officers when status is LESSONS_LEARNED. CLOSED findings and history are read-only. No saved analysis returns analysis=null.',
      security: [{ bearerAuth: [] }],
      parameters: [id],
      responses: {
        '200': response({
          type: 'object',
          required: ['analysis', 'canEdit', 'editRestriction'],
          properties: {
            analysis: { ...analysis, nullable: true },
            canEdit: { type: 'boolean' },
            editRestriction: { type: 'string', nullable: true },
          },
        }),
        ...errors,
      },
    },
    patch: {
      tags: ['Incident Management'],
      summary: 'Document root cause, lessons learned and recommendations',
      description:
        'Active Security Officers only, after response is complete (LESSONS_LEARNED). CLOSED rejects writes with 409 INCIDENT_CLOSED, rechecked under the transaction incident lock. Upserts existing unique incident_analysis and appends before/after audit atomically. Performer/time are server-owned. Does not change incident status. expectedUpdatedAt is required: null for first save, otherwise use GET analysis.updatedAt verbatim.',
      security: [{ bearerAuth: [] }],
      parameters: [id],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['rootCause', 'lessonsLearned', 'improvementActions', 'expectedUpdatedAt'],
              properties: {
                rootCause: { type: 'string', minLength: 20, maxLength: 4000 },
                lessonsLearned: { type: 'string', minLength: 20, maxLength: 4000 },
                improvementActions: { type: 'string', minLength: 20, maxLength: 4000 },
                expectedUpdatedAt: { type: 'string', format: 'date-time', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        '200': response(analysis),
        ...errors,
        '409': {
          description:
            'INCIDENT_CLOSED (read-only), incident not ready, stale analysis or concurrent update; reload before retrying',
        },
      },
    },
  },
  '/incidents/{incidentId}/analysis/history': {
    get: {
      tags: ['Incident Management'],
      summary: 'View root cause analysis revision history',
      description:
        'Active Security Officers and Executives. Reads immutable INCIDENT_ANALYSIS_SAVED audits, newest first with stable ID tie-break. before=null on first save. Names reflect current accounts; malformed historical snapshots are returned as null rather than fabricated.',
      security: [{ bearerAuth: [] }],
      parameters: [
        id,
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
      ],
      responses: {
        '200': response({
          type: 'object',
          required: ['items', 'pagination'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'savedAt', 'savedBy', 'before', 'findings'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  savedAt: { type: 'string', format: 'date-time' },
                  savedBy: { ...actor, nullable: true },
                  before: { ...findings, nullable: true },
                  findings: { ...findings, nullable: true },
                },
              },
            },
            pagination: {
              type: 'object',
              required: ['page', 'limit', 'total', 'totalPages'],
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
              },
            },
          },
        }),
        ...errors,
      },
    },
  },
};

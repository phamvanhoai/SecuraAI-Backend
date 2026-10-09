const timestamp = { type: 'string', format: 'date-time' };
const actor = {
  type: 'object',
  nullable: true,
  required: ['id', 'name'],
  properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
};
const envelope = (data: object) => ({
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['success', 'data'],
        properties: { success: { type: 'boolean', enum: [true] }, data },
      },
    },
  },
});
export const incidentClosurePaths = {
  '/incidents/{incidentId}/close': {
    get: {
      tags: ['Incidents'],
      summary: 'Review closure readiness and retained closure record',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'incidentId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      description:
        'Active Security Officers and Executives. Readiness is backend-derived. Existing closed records without closure audit return closure=null, never fabricated metadata.',
      responses: {
        '200': {
          description: 'Closure review',
          ...envelope({
            type: 'object',
            required: [
              'status',
              'expectedUpdatedAt',
              'closedAt',
              'canClose',
              'restriction',
              'closure',
            ],
            properties: {
              status: {
                type: 'string',
                enum: [
                  'open',
                  'triage',
                  'containment',
                  'eradication',
                  'recovery',
                  'lessons_learned',
                  'closed',
                ],
              },
              expectedUpdatedAt: timestamp,
              closedAt: { ...timestamp, nullable: true },
              canClose: { type: 'boolean' },
              restriction: { type: 'string', nullable: true },
              closure: {
                type: 'object',
                nullable: true,
                required: ['id', 'recordedAt', 'closedBy', 'summary'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  recordedAt: timestamp,
                  closedBy: actor,
                  summary: { type: 'string', nullable: true },
                },
              },
            },
          }),
        },
        '401': { description: 'Authentication required' },
        '403': { description: 'Incident read permission required' },
        '404': { description: 'Incident not found' },
      },
    },
    post: {
      tags: ['Incidents'],
      summary: 'Close an incident (UC63)',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'incidentId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      description:
        'Active Security Officer only. SecuraAI readiness rules: LESSONS_LEARNED and recorded nonblank root cause, lessons learned and improvement recommendations. Requires explicit officer confirmation that required response/recovery work is complete; journal counts are not completion gates. Server records CLOSED and closed_at with closure summary/actor audit atomically. Mandatory optimistic timestamp; concurrent writes return 409. Repeated closure returns changed=false without rewriting time/audit. No reopening, fabricated classification, client-selected closure time or database migration. All prior history is retained.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['summary', 'confirmed', 'expectedUpdatedAt'],
              properties: {
                summary: { type: 'string', minLength: 20, maxLength: 4000 },
                confirmed: { type: 'boolean', enum: [true] },
                expectedUpdatedAt: timestamp,
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Closure saved or existing closure retained',
          ...envelope({
            type: 'object',
            required: ['changed', 'closedAt'],
            properties: {
              changed: { type: 'boolean' },
              closedAt: { ...timestamp, nullable: true },
            },
          }),
        },
        '401': { description: 'Authentication required' },
        '403': { description: 'Active Security Officer required' },
        '404': { description: 'Incident not found' },
        '409': { description: 'INCIDENT_STALE or INCIDENT_NOT_READY_TO_CLOSE' },
        '422': { description: 'Invalid or extra request fields' },
      },
    },
  },
};

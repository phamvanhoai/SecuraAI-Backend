const phase = {
  type: 'string',
  enum: ['OPEN', 'TRIAGE', 'CONTAINMENT', 'ERADICATION', 'RECOVERY', 'LESSONS_LEARNED', 'CLOSED'],
};
const actor = {
  type: 'object',
  nullable: true,
  required: ['id', 'name'],
  properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' } },
};
const params = [
  { in: 'path', name: 'incidentId', required: true, schema: { type: 'string', format: 'uuid' } },
];
const historyItem = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    occurredAt: { type: 'string', format: 'date-time' },
    actor,
    before: { type: 'object', properties: { status: phase } },
    after: {
      type: 'object',
      properties: {
        status: phase,
        note: { type: 'string' },
        skipReason: { type: 'string', nullable: true },
        skippedPhases: { type: 'array', items: phase },
        currentPhaseCompleted: { type: 'boolean' },
        recoveryVerified: { type: 'boolean' },
      },
    },
  },
};
const historyResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', enum: [true] },
    data: {
      type: 'object',
      properties: {
        items: { type: 'array', items: historyItem },
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
    },
  },
};
export const incidentProgressPaths = {
  '/incidents/{incidentId}/progress': {
    patch: {
      tags: ['Incidents'],
      summary: 'Confirm the next incident handling phase',
      security: [{ bearerAuth: [] }],
      parameters: params,
      description:
        "Active Security Officer only. Manual, forward, non-closing phase assessment with required confirmation, results/validation note and stale-state guards. Normal order: OPEN -> TRIAGE -> CONTAINMENT -> ERADICATION -> RECOVERY -> LESSONS_LEARNED. Classification, assignment and response-action recording never change phase. Action counts are not completion gates; the system does not independently verify task completion or recovery. Emergency jumps or deferred completion require skipReason and are audited, not treated as completed earlier work. LESSONS_LEARNED requires current RECOVERY and the officer's explicit restoration/validation attestation. These transition restrictions are SecuraAI product rules, not universal industry requirements. Status and audit are atomic. No schema changes.",
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['status', 'expectedStatus', 'expectedUpdatedAt', 'confirmed', 'note'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['triage', 'containment', 'eradication', 'recovery', 'lessons_learned'],
                },
                expectedStatus: {
                  type: 'string',
                  enum: ['open', 'triage', 'containment', 'eradication', 'recovery'],
                },
                expectedUpdatedAt: { type: 'string', format: 'date-time' },
                confirmed: { type: 'boolean', enum: [true] },
                note: { type: 'string', minLength: 10, maxLength: 2000 },
                skipReason: { type: 'string', minLength: 10, maxLength: 2000 },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Success envelope with the updated incident (same fields as list/detail)',
        },
        '401': { description: 'Authentication required' },
        '403': { description: 'Active Security Officer required' },
        '404': { description: 'Incident not found' },
        '409': {
          description: 'Stale incident, invalid phase or recovery not yet reached',
        },
        '422': { description: 'Invalid input or missing emergency skip reason' },
      },
    },
    get: {
      tags: ['Incidents'],
      summary: 'View audited phase transition history',
      security: [{ bearerAuth: [] }],
      parameters: [
        ...params,
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        },
      ],
      description:
        'Active Security Officers and Executives, including closed incidents. Explicit phase transitions only; classification and assignment history remain in their existing views. Latest time first with stable ID tie-break.',
      responses: {
        '200': {
          description: 'Paginated audit snapshots',
          content: { 'application/json': { schema: historyResponse } },
        },
        '401': { description: 'Authentication required' },
        '403': { description: 'Security Officer or Executive required' },
        '404': { description: 'Incident not found' },
        '422': { description: 'Invalid pagination' },
      },
    },
  },
};

export const incidentPaths = {
  '/incidents': {
    get: {
      tags: ['Incidents'],
      summary: 'List incidents for severity classification (UC56)',
      description: 'Requires incidents.classify.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
        { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 } },
        {
          name: 'severity',
          in: 'query',
          schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        },
        {
          name: 'status',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['reported', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed'],
          },
        },
        {
          name: 'classification',
          in: 'query',
          schema: { type: 'string', enum: ['unclassified', 'classified'] },
        },
      ],
      responses: {
        '200': { description: 'Paginated classification queue' },
        '403': { description: 'Classification permission required' },
      },
    },
    post: {
      tags: ['Incidents'],
      summary: 'Report a new information security incident (UC55)',
      description:
        'Requires incidents.report. The backend assigns the reporter, incident code, detected time, initial status and audit record.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['title', 'description', 'category'],
              properties: {
                title: { type: 'string', minLength: 5, maxLength: 255 },
                description: { type: 'string', minLength: 20, maxLength: 10000 },
                category: {
                  type: 'string',
                  enum: [
                    'phishing',
                    'malware',
                    'account_compromise',
                    'data_exposure',
                    'network',
                    'physical',
                    'other',
                  ],
                },
                occurredAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Incident report created' },
        '403': { description: 'Incident reporting permission required' },
        '422': { description: 'Invalid report' },
      },
    },
  },
  '/incidents/mine': {
    get: {
      tags: ['Incidents'],
      summary: 'List incidents reported by the current user',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
      ],
      responses: {
        '200': { description: 'Paginated own incident reports' },
        '403': { description: 'Incident reporting permission required' },
      },
    },
  },
  '/incidents/{incidentId}': {
    get: {
      tags: ['Incidents'],
      summary: 'View an incident reported by the current user',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'incidentId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Incident report details' },
        '404': { description: 'Incident is missing or belongs to another reporter' },
      },
    },
  },
  '/incidents/{incidentId}/severity': {
    patch: {
      tags: ['Incidents'],
      summary: 'Classify incident severity (UC56)',
      description:
        'Updates severity and records an incident update and audit log atomically. Requires incidents.classify.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'incidentId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['severity', 'rationale'],
              properties: {
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                rationale: { type: 'string', minLength: 10, maxLength: 2000 },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Incident severity classified' },
        '404': { description: 'Incident not found' },
        '409': { description: 'Closed incident cannot be reclassified' },
      },
    },
  },
} as const;

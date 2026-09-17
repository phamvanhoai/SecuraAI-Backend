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
  '/incidents/assignment-options': {
    get: {
      tags: ['Incidents'],
      summary: 'List eligible incident handlers (UC57)',
      description:
        'Returns up to 200 active users whose role grants incidents.classify. Requires incidents.assign.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Eligible active security officers' },
        '403': { description: 'Incident assignment permission required' },
      },
    },
  },
  '/incidents/{incidentId}/assignee': {
    patch: {
      tags: ['Incidents'],
      summary: 'Assign or reassign an incident handler (UC57)',
      description:
        'Closes any active assignment, creates the new assignment, updates reported incidents to assigned, and records incident history and audit data atomically. Requires incidents.assign.',
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
              required: ['assigneeUserId', 'note'],
              properties: {
                assigneeUserId: { type: 'string', format: 'uuid' },
                note: { type: 'string', minLength: 10, maxLength: 2000 },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Incident handler assigned' },
        '404': { description: 'Incident not found' },
        '409': { description: 'Resolved or closed incident cannot be assigned' },
        '422': { description: 'Assignee is not an eligible active security officer' },
      },
    },
  },
  '/incidents/{incidentId}/progress': {
    patch: {
      tags: ['Incidents'],
      summary: 'Update incident handling progress (UC58)',
      description:
        'Applies a controlled workflow transition and records an incident update and audit log atomically. The active handler may update progress; a caller with incidents.assign may coordinate an override. Resolving or closing completes the active assignment. Requires incidents.update-progress.',
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
              required: ['status', 'note'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['in_progress', 'escalated', 'resolved', 'closed'],
                },
                note: { type: 'string', minLength: 10, maxLength: 5000 },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Incident progress updated' },
        '403': { description: 'Caller is neither the active handler nor an incident coordinator' },
        '404': { description: 'Incident not found' },
        '409': {
          description: 'Incident is unassigned, or workflow transition is invalid or unchanged',
        },
      },
    },
  },
} as const;

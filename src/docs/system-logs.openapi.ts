export const systemLogPaths = {
  '/system-logs': {
    get: {
      tags: ['Notification & System Logs'],
      summary: 'Search system logs with advanced filters',
      description:
        'Allows active Administrators and Security Officers with system-logs.search permission to search audit-backed operational logs. Sensitive before/after payloads are not returned.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        { in: 'query', name: 'q', schema: { type: 'string', maxLength: 100 } },
        { in: 'query', name: 'eventType', schema: { type: 'string', maxLength: 150 } },
        { in: 'query', name: 'source', schema: { type: 'string', maxLength: 100 } },
        { in: 'query', name: 'actor', schema: { type: 'string', maxLength: 100 } },
        {
          in: 'query',
          name: 'status',
          schema: { type: 'string', enum: ['SUCCESS', 'FAILURE', 'DENIED'] },
        },
        { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
      ],
      responses: {
        '200': { description: 'Paginated system logs' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Insufficient permission or role' },
        '422': { description: 'Invalid filters' },
      },
    },
  },
  '/system-logs/export': {
    post: {
      tags: ['Notification & System Logs'],
      summary: 'Export investigation logs',
      description:
        'Generates a CSV or JSON file from selected logs or all logs matching the supplied filters. Restricted to active Administrators and Security Officers with system-logs.export permission. Exports are capped at 10,000 records and recorded for auditability.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['format', 'scope', 'reason'],
              properties: {
                format: { type: 'string', enum: ['CSV', 'JSON', 'XLSX', 'PDF'] },
                scope: { type: 'string', enum: ['SELECTED', 'FILTERED'] },
                selectedIds: {
                  type: 'array',
                  maxItems: 1000,
                  items: { type: 'string', format: 'uuid' },
                },
                filters: { type: 'object' },
                reason: { type: 'string', minLength: 10, maxLength: 500 },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Generated investigation log file with RFC 9530 content digest',
          headers: {
            'Content-Digest': { schema: { type: 'string' } },
            'X-Content-SHA256': { schema: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
          },
        },
        '401': { description: 'Authentication required' },
        '403': { description: 'Insufficient permission or role' },
        '409': { description: 'Selected log set changed' },
        '422': { description: 'Invalid input or export exceeds 10,000 records' },
      },
    },
  },
} as const;

export const systemLogPaths = {
  '/system-logs': {
    get: {
      tags: ['Notification & System Logs'],
      summary: 'Search system logs with advanced filters',
      description: 'Allows active Administrators and Security Officers with system-logs.search permission to search audit-backed operational logs. Sensitive before/after payloads are not returned.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        { in: 'query', name: 'q', schema: { type: 'string', maxLength: 100 } },
        { in: 'query', name: 'eventType', schema: { type: 'string', maxLength: 150 } },
        { in: 'query', name: 'source', schema: { type: 'string', maxLength: 100 } },
        { in: 'query', name: 'actor', schema: { type: 'string', maxLength: 100 } },
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['SUCCESS', 'FAILURE', 'DENIED'] } },
        { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
      ],
      responses: { '200': { description: 'Paginated system logs' }, '401': { description: 'Authentication required' }, '403': { description: 'Insufficient permission or role' }, '422': { description: 'Invalid filters' } },
    },
  },
} as const;

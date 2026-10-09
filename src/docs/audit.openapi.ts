export const auditPaths = {
  '/audit/user-activities': {
    get: {
      tags: ['Notification & System Logs'],
      summary: 'View user activity audit log',
      description:
        'Allows an active Administrator to view paginated audit records produced by user actors. Sensitive before/after payloads are not included.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        { in: 'query', name: 'q', schema: { type: 'string', maxLength: 100 } },
        {
          in: 'query',
          name: 'outcome',
          schema: { type: 'string', enum: ['SUCCESS', 'FAILURE', 'DENIED'] },
        },
        { in: 'query', name: 'resourceType', schema: { type: 'string', maxLength: 100 } },
      ],
      responses: {
        '200': { description: 'Paginated user activity audit records' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Administrator access required' },
        '422': { description: 'Invalid filters or pagination' },
      },
    },
  },
} as const;

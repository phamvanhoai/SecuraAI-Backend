export const complianceReminderPaths = {
  '/notifications/compliance-reminders': {
    get: {
      tags: ['Policies'],
      summary: 'List own compliance deadline reminders (UC54)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['all', 'unread'], default: 'all' },
        },
        { name: 'search', in: 'query', schema: { type: 'string', maxLength: 100 } },
      ],
      responses: {
        '200': { description: 'Own paginated compliance reminders' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Compliance reminder access required' },
      },
    },
  },
  '/notifications/compliance-reminders/{notificationId}/read': {
    patch: {
      tags: ['Policies'],
      summary: 'Mark own compliance reminder as read',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'notificationId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Updated reminder' },
        '404': { description: 'Reminder not found' },
      },
    },
  },
} as const;

export const notificationPaths = {
  '/notifications': {
    post: {
      tags: ['Notification & System Logs'],
      summary: 'Send an in-system notification',
      description:
        'Allows an active Administrator to send one notification to active users selected explicitly or resolved from fixed role groups. Recipient membership is snapshotted when sent.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'message', 'priority', 'audience'],
              properties: {
                title: { type: 'string', minLength: 1, maxLength: 160 },
                message: { type: 'string', minLength: 1, maxLength: 2000 },
                priority: { type: 'string', enum: ['NORMAL', 'IMPORTANT', 'URGENT'] },
                audience: {
                  oneOf: [
                    {
                      type: 'object',
                      additionalProperties: false,
                      required: ['type', 'roles'],
                      properties: {
                        type: { type: 'string', enum: ['roles'] },
                        roles: {
                          type: 'array',
                          minItems: 1,
                          maxItems: 4,
                          uniqueItems: true,
                          items: {
                            type: 'string',
                            enum: ['ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE', 'EMPLOYEE'],
                          },
                        },
                      },
                    },
                    {
                      type: 'object',
                      additionalProperties: false,
                      required: ['type', 'userIds'],
                      properties: {
                        type: { type: 'string', enum: ['users'] },
                        userIds: {
                          type: 'array',
                          minItems: 1,
                          maxItems: 200,
                          uniqueItems: true,
                          items: { type: 'string', format: 'uuid' },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Notification stored and assigned to recipients' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Administrator access required' },
        '409': { description: 'Recipient eligibility changed during delivery' },
        '422': { description: 'Invalid input or no eligible active recipients' },
      },
    },
  },
} as const;

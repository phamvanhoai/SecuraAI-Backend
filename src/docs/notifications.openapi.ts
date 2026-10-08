export const notificationPaths = {
  '/notifications/preferences': {
    get: {
      tags: ['Notification & System Logs'],
      summary: 'Get personal notification channel preferences',
      description:
        'Returns the authenticated active user preferences for the supported in-system and email channels. Channels default to enabled until explicitly configured.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Personal notification preferences' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Notification preference capability required' },
      },
    },
    patch: {
      tags: ['Notification & System Logs'],
      summary: 'Update personal notification channel preferences',
      description:
        'Replaces the authenticated active user preferences for all currently supported channels. At least one channel must remain enabled.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['channels'],
              properties: {
                channels: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['inSystem', 'email'],
                  properties: {
                    inSystem: { type: 'boolean' },
                    email: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Personal notification preferences updated' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Notification preference capability required' },
        '422': { description: 'Invalid channel selection' },
      },
    },
  },
  '/notifications/email': {
    post: {
      tags: ['Notification & System Logs'],
      summary: 'Send an email notification',
      description:
        'Allows an active Administrator to send a text-only email through the configured SMTP service to up to 20 selected active users. Delivery outcomes are recorded per recipient.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['subject', 'message', 'userIds'],
              properties: {
                subject: { type: 'string', minLength: 1, maxLength: 160 },
                message: { type: 'string', minLength: 1, maxLength: 4000 },
                userIds: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 20,
                  uniqueItems: true,
                  items: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Email attempts completed and delivery statuses recorded' },
        '401': { description: 'Authentication required' },
        '403': { description: 'Administrator access required' },
        '409': { description: 'Recipient eligibility changed during preparation' },
        '422': { description: 'Invalid content or recipient selection' },
        '503': { description: 'SMTP delivery is not configured' },
      },
    },
  },
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

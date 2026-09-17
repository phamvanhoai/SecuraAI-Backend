const reminder = {
  type: 'object',
  required: ['notificationId', 'enrollmentId', 'title', 'message', 'isRead', 'readAt', 'createdAt'],
  properties: {
    notificationId: { type: 'string', format: 'uuid' },
    enrollmentId: { type: 'string', format: 'uuid', nullable: true },
    title: { type: 'string' },
    message: { type: 'string' },
    isRead: { type: 'boolean' },
    readAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};
const response = (data: object) => ({
  description: 'Success',
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
const errors = {
  '401': { description: 'Authentication required' },
  '403': { description: 'Training assessment permission required' },
};

export const trainingReminderPaths = {
  '/training/deadline-reminders': {
    get: {
      tags: ['Training Awareness'],
      summary: 'List own in-app training deadline reminders (UC79)',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'search',
          in: 'query',
          description:
            'Case-insensitive literal search in reminder title/message, including course names in the historical message. Maximum 100 characters.',
          schema: { type: 'string', maxLength: 100 },
        },
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
        },
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
      ],
      responses: {
        '200': response({
          type: 'object',
          required: ['items', 'pagination'],
          properties: {
            items: { type: 'array', items: reminder },
            pagination: {
              type: 'object',
              required: ['page', 'limit', 'total', 'totalPages'],
              properties: {
                page: { type: 'integer', minimum: 1 },
                limit: { type: 'integer', minimum: 1, maximum: 50 },
                total: { type: 'integer', minimum: 0 },
                totalPages: { type: 'integer', minimum: 1 },
              },
            },
          },
        }),
        ...errors,
        '422': { description: 'Invalid pagination or status filter' },
      },
    },
  },
  '/training/deadline-reminders/{notificationId}/read': {
    patch: {
      tags: ['Training Awareness'],
      summary: 'Mark own training deadline reminder as read',
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
        '200': response(reminder),
        ...errors,
        '422': { description: 'Invalid notification ID' },
        '404': { description: 'Reminder missing or belongs to another user' },
      },
    },
  },
  '/training/deadline-reminders/dispatch': {
    get: {
      tags: ['Training Awareness'],
      summary: 'Dispatch automatic training reminders (scheduler only)',
      description:
        'Requires CRON_SECRET bearer authentication, not a user JWT. No-store response. Bounded batch; repeat when hasMore is true. In-app only, no schema changes.',
      security: [{ reminderCronAuth: [] }],
      responses: {
        '200': response({
          type: 'object',
          required: ['delivered', 'processed', 'hasMore'],
          properties: {
            delivered: { type: 'integer', minimum: 0 },
            processed: { type: 'integer', minimum: 0 },
            hasMore: { type: 'boolean' },
          },
        }),
        '401': { description: 'Invalid scheduler secret' },
        '503': { description: 'Secret not configured or reminders disabled' },
      },
    },
  },
};

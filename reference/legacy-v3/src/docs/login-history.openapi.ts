const paths = {
  '/login-history': {
    get: {
      tags: ['Login History'],
      summary: 'Search login history',
      description:
        'Requires ADMIN or SECURITY_OFFICER and login-history.read. Only completed authentication is successful; password validation before MFA is not a success.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        {
          name: 'search',
          in: 'query',
          description: 'Case-insensitive attempted email or user name',
          schema: { type: 'string', minLength: 1, maxLength: 255 },
        },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['success', 'failed'] } },
        { name: 'userId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'ipAddress',
          in: 'query',
          description: 'Exact IPv4 or IPv6 address',
          schema: { type: 'string' },
        },
        ...['from', 'to'].map((name) => ({
          name,
          in: 'query',
          description: 'Inclusive timestamp with timezone; from must not exceed to',
          schema: { type: 'string', format: 'date-time' },
        })),
        {
          name: 'sortBy',
          in: 'query',
          schema: { type: 'string', enum: ['loginTime'], default: 'loginTime' },
        },
        {
          name: 'sortOrder',
          in: 'query',
          schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      ],
      responses: {
        '200': {
          description: 'Paginated login history',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['success', 'data'],
                properties: {
                  success: { type: 'boolean', enum: [true] },
                  data: {
                    type: 'object',
                    required: ['items', 'pagination'],
                    properties: {
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: [
                            'id',
                            'userId',
                            'userName',
                            'email',
                            'loginTime',
                            'status',
                            'ipAddress',
                            'userAgent',
                            'failureReason',
                          ],
                          properties: {
                            id: { type: 'string', format: 'uuid' },
                            userId: { type: 'string', format: 'uuid', nullable: true },
                            userName: { type: 'string', nullable: true },
                            email: { type: 'string' },
                            loginTime: { type: 'string', format: 'date-time' },
                            status: { type: 'string', enum: ['success', 'failed'] },
                            ipAddress: { type: 'string', nullable: true },
                            userAgent: { type: 'string', nullable: true },
                            failureReason: { type: 'string', nullable: true },
                          },
                        },
                      },
                      pagination: {
                        type: 'object',
                        required: ['page', 'limit', 'total', 'totalPages'],
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
              },
            },
          },
        },
        '401': { description: 'Missing, invalid or expired token' },
        '403': { description: 'Disallowed role, missing permission or inactive account' },
        '422': { description: 'Invalid search/filter/pagination parameters' },
        '500': { description: 'Service error' },
      },
    },
  },
};

export const loginHistoryPaths = {
  ...paths,
  '/administration/login-history': paths['/login-history'],
};

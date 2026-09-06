import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '../config/env.js';

export const openApiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SecuraAI API',
      version: '0.1.0',
      description: 'Secure backend API for the SecuraAI GRC and anomaly detection platform.',
    },
    servers: [{ url: env.API_PREFIX, description: 'Current server' }],
    tags: [{ name: 'Health' }, { name: 'Authentication' }, { name: 'Users' }, { name: 'Policies' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password', minLength: 8 },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
        TokenPair: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'string', example: '15m' },
          },
        },
        CreatePolicyDraftRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['policyCode', 'title', 'content'],
          properties: {
            policyCode: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$',
              example: 'ISP-001',
            },
            title: {
              type: 'string',
              minLength: 3,
              maxLength: 255,
              example: 'Information Security Policy',
            },
            description: { type: 'string', maxLength: 2000 },
            versionNumber: {
              type: 'string',
              minLength: 1,
              maxLength: 30,
              default: '1.0',
            },
            content: { type: 'string', minLength: 1, maxLength: 500000 },
          },
        },
        PolicyDraft: {
          type: 'object',
          required: [
            'id',
            'policyCode',
            'title',
            'description',
            'ownerUserId',
            'status',
            'currentVersion',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            policyCode: { type: 'string', example: 'ISP-001' },
            title: { type: 'string', example: 'Information Security Policy' },
            description: { type: 'string', nullable: true },
            ownerUserId: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', enum: ['draft'] },
            currentVersion: {
              type: 'object',
              required: ['id', 'versionNumber', 'content', 'status', 'createdAt'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                versionNumber: { type: 'string', example: '1.0' },
                content: { type: 'string' },
                status: { type: 'string', enum: ['draft'] },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: { code: { type: 'string' }, message: { type: 'string' } },
            },
            requestId: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/health/live': {
        get: {
          tags: ['Health'],
          summary: 'Liveness check',
          responses: { '200': { description: 'API is alive' } },
        },
      },
      '/health/ready': {
        get: {
          tags: ['Health'],
          summary: 'Readiness and database check',
          responses: {
            '200': { description: 'API is ready' },
            '500': { description: 'Dependency unavailable' },
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Authentication'],
          summary: 'Sign in',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
            },
          },
          responses: {
            '200': {
              description: 'Authenticated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/TokenPair' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Invalid credentials' },
            '429': { description: 'Too many attempts' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Authentication'],
          summary: 'Rotate refresh token',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
            },
          },
          responses: {
            '200': { description: 'New token pair' },
            '401': { description: 'Invalid token' },
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Authentication'],
          summary: 'Revoke refresh token',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
            },
          },
          responses: { '204': { description: 'Logged out' } },
        },
      },
      '/users/me': {
        get: {
          tags: ['Users'],
          summary: 'Get current user',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Current user' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/compliance/policies': {
        post: {
          tags: ['Policies'],
          summary: 'Create an information security policy draft',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatePolicyDraftRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Policy draft created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/PolicyDraft' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'Missing policies:create permission' },
            '409': { description: 'Policy code already exists' },
            '422': { description: 'Request validation failed' },
          },
        },
      },
    },
  },
  apis: [],
});

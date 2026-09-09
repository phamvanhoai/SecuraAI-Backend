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
    tags: [{ name: 'Health' }, { name: 'Authentication' }, { name: 'Users' }, { name: 'Assets' }],
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
        AssetSummary: {
          type: 'object',
          required: [
            'id',
            'assetCode',
            'name',
            'assetType',
            'criticality',
            'status',
            'location',
            'department',
            'owner',
            'updatedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            assetCode: { type: 'string', example: 'AST-001' },
            name: { type: 'string', example: 'Database Server' },
            assetType: { type: 'string', example: 'server' },
            criticality: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'retired', 'disposed'],
            },
            location: { type: 'string', nullable: true },
            department: {
              type: 'object',
              nullable: true,
              required: ['id', 'code', 'name'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                code: { type: 'string' },
                name: { type: 'string' },
              },
            },
            owner: {
              type: 'object',
              nullable: true,
              required: ['id', 'fullName'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                fullName: { type: 'string' },
              },
            },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateAssetRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['assetCode', 'name', 'assetType'],
          properties: {
            assetCode: {
              type: 'string',
              minLength: 1,
              maxLength: 50,
              pattern: '^[A-Za-z0-9][A-Za-z0-9._/-]*$',
              example: 'AST-001',
            },
            name: { type: 'string', minLength: 1, maxLength: 150 },
            assetType: { type: 'string', minLength: 1, maxLength: 50, example: 'server' },
            description: { type: 'string', maxLength: 10000 },
            departmentId: { type: 'string', format: 'uuid' },
            ownerUserId: { type: 'string', format: 'uuid' },
            criticality: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
            },
            hostname: { type: 'string', maxLength: 255 },
            ipAddress: { type: 'string', format: 'ip' },
            location: { type: 'string', maxLength: 255 },
            metadata: { type: 'object', description: 'JSON object up to 20 KB.' },
          },
        },
        AssetDetail: {
          allOf: [
            { $ref: '#/components/schemas/AssetSummary' },
            {
              type: 'object',
              required: ['description', 'hostname', 'ipAddress', 'createdAt'],
              properties: {
                description: { type: 'string', nullable: true },
                hostname: { type: 'string', nullable: true },
                ipAddress: { type: 'string', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        UpdateAssetRequest: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 150 },
            assetType: { type: 'string', minLength: 1, maxLength: 50 },
            description: { type: 'string', maxLength: 10000, nullable: true },
            departmentId: { type: 'string', format: 'uuid', nullable: true },
            ownerUserId: { type: 'string', format: 'uuid', nullable: true },
            hostname: { type: 'string', maxLength: 255, nullable: true },
            ipAddress: { type: 'string', format: 'ip', nullable: true },
            location: { type: 'string', maxLength: 255, nullable: true },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'retired', 'disposed'],
            },
            metadata: { type: 'object', description: 'JSON object up to 20 KB.' },
          },
        },
        ClassifyAssetCriticalityRequest: {
          type: 'object',
          additionalProperties: false,
          required: [
            'confidentialityImpact',
            'integrityImpact',
            'availabilityImpact',
            'businessImpact',
            'reason',
          ],
          properties: {
            confidentialityImpact: { type: 'integer', minimum: 1, maximum: 5 },
            integrityImpact: { type: 'integer', minimum: 1, maximum: 5 },
            availabilityImpact: { type: 'integer', minimum: 1, maximum: 5 },
            businessImpact: { type: 'integer', minimum: 1, maximum: 5 },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
          },
        },
        AssetCriticalityClassification: {
          type: 'object',
          required: [
            'assetId',
            'previousCriticality',
            'criticality',
            'score',
            'changed',
            'classifiedAt',
          ],
          properties: {
            assetId: { type: 'string', format: 'uuid' },
            previousCriticality: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            criticality: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            score: { type: 'number', minimum: 1, maximum: 5, example: 4.55 },
            changed: { type: 'boolean' },
            classifiedAt: { type: 'string', format: 'date-time' },
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
      '/assets': {
        post: {
          tags: ['Assets'],
          summary: 'Create an IT asset',
          description:
            'Creates an active asset and atomically records its change history and audit log. Requires the assets.create permission.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateAssetRequest' } },
            },
          },
          responses: {
            '201': {
              description: 'Asset created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/AssetDetail' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.create permission is required' },
            '404': { description: 'Department or owner was not found' },
            '409': { description: 'Asset code already exists' },
            '422': { description: 'Invalid body or inactive department/owner' },
            '429': { description: 'Too many requests' },
            '500': { description: 'Unexpected server error' },
          },
        },
        get: {
          tags: ['Assets'],
          summary: 'View the asset list',
          description:
            'Returns a paginated list of non-deleted assets. Requires the assets.read permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', minimum: 1, default: 1 },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'q',
              in: 'query',
              description: 'Case-insensitive search by code, name, hostname or location.',
              schema: { type: 'string', minLength: 1, maxLength: 100 },
            },
            { name: 'assetType', in: 'query', schema: { type: 'string', maxLength: 50 } },
            {
              name: 'criticality',
              in: 'query',
              schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['active', 'inactive', 'retired', 'disposed'],
              },
            },
            {
              name: 'departmentId',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'ownerUserId',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'sortBy',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['assetCode', 'name', 'createdAt', 'updatedAt'],
                default: 'assetCode',
              },
            },
            {
              name: 'sortOrder',
              in: 'query',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
            },
          ],
          responses: {
            '200': {
              description: 'Paginated asset list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        required: ['items', 'pagination'],
                        properties: {
                          items: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/AssetSummary' },
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
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Error' } },
              },
            },
            '403': {
              description: 'The assets.read permission is required',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Error' } },
              },
            },
            '422': {
              description: 'Invalid query parameters',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Error' } },
              },
            },
            '429': {
              description: 'Too many requests',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Error' } },
              },
            },
            '500': {
              description: 'Unexpected server error',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Error' } },
              },
            },
          },
        },
      },
      '/assets/{assetId}': {
        patch: {
          tags: ['Assets'],
          summary: 'Update an IT asset',
          description:
            'Partially updates a non-deleted asset and atomically records changed fields in history and audit logs. Requires the assets.update permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'assetId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UpdateAssetRequest' } },
            },
          },
          responses: {
            '200': {
              description: 'Asset updated, or returned unchanged when values are identical',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/AssetDetail' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.update permission is required' },
            '404': { description: 'Asset, department or owner was not found' },
            '422': {
              description: 'Invalid input, inactive relation or forbidden status transition',
            },
            '429': { description: 'Too many requests' },
            '500': { description: 'Unexpected server error' },
          },
        },
        delete: {
          tags: ['Assets'],
          summary: 'Delete an IT asset',
          description:
            'Soft-deletes an asset only when it has no active business dependencies. The operation atomically records change history and an audit log. Requires the assets.delete permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'assetId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '204': { description: 'Asset deleted' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.delete permission is required' },
            '404': { description: 'Asset was not found or was already deleted' },
            '409': { description: 'Asset has active business dependencies' },
            '422': { description: 'Invalid asset ID' },
            '429': { description: 'Too many requests' },
            '500': { description: 'Unexpected server error' },
          },
        },
      },
      '/assets/{assetId}/classify-criticality': {
        post: {
          tags: ['Assets'],
          summary: 'Classify asset criticality',
          description:
            'Calculates criticality from confidentiality, integrity, availability and business impact scores. Every classification is recorded in history and audit logs. Requires the assets.classify permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'assetId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClassifyAssetCriticalityRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Criticality classified',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/AssetCriticalityClassification' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.classify permission is required' },
            '404': { description: 'Asset was not found' },
            '422': { description: 'Invalid scores, reason, asset ID or disposed asset' },
            '429': { description: 'Too many requests' },
            '500': { description: 'Unexpected server error' },
          },
        },
      },
    },
  },
  apis: [],
});

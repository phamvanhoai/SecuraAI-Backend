import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '@/config/env.js';

export const openApiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SecuraAI API',
      version: '0.1.0',
      description: 'Secure backend API for the SecuraAI GRC and anomaly detection platform.',
    },
    servers: [{ url: env.API_PREFIX, description: 'Current server' }],
    tags: [{ name: 'Health' }, { name: 'Authentication' }, { name: 'Users' }, { name: 'Integrations' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        LoginRequest: {
          type: 'object', required: ['email', 'password'],
          properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password', minLength: 8 } },
        },
        RefreshRequest: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } },
        TokenPair: {
          type: 'object',
          properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' }, expiresIn: { type: 'string', example: '15m' } },
        },
        Error: {
          type: 'object',
          properties: { success: { type: 'boolean', example: false }, error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } }, requestId: { type: 'string' } },
        },
        CreateIntegrationRequest: {
          type: 'object',
          required: ['name', 'integrationType'],
          properties: {
            name: { type: 'string', example: 'Splunk Enterprise SIEM' },
            integrationType: { type: 'string', enum: ['siem', 'firewall', 'log_source', 'api'], example: 'siem' },
            baseUrl: { type: 'string', format: 'uri', example: 'https://siem.enterprise.local:8089' },
            configuration: { type: 'object', example: { timeoutMs: 5000 } },
          },
        },
        UpdateIntegrationRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Palo Alto Perimeter Firewall' },
            baseUrl: { type: 'string', format: 'uri', example: 'https://firewall.enterprise.local' },
            configuration: { type: 'object' },
            status: { type: 'string', enum: ['active', 'inactive', 'disabled'], example: 'active' },
          },
        },
        TestConnectionRequest: {
          type: 'object',
          properties: {
            timeoutMs: { type: 'integer', minimum: 1000, maximum: 10000, default: 5000, example: 5000 },
          },
        },
        IntegrationResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            integrationType: { type: 'string' },
            baseUrl: { type: 'string', nullable: true },
            configuration: { type: 'object', nullable: true },
            status: { type: 'string' },
            lastConnectedAt: { type: 'string', format: 'date-time', nullable: true },
            createdByUserId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        TestConnectionResponse: {
          type: 'object',
          properties: {
            connected: { type: 'boolean', example: true },
            statusCode: { type: 'integer', nullable: true, example: 200 },
            latencyMs: { type: 'integer', example: 124 },
            message: { type: 'string', example: 'Connection established successfully' },
          },
        },
      },
    },
    paths: {
      '/health/live': { get: { tags: ['Health'], summary: 'Liveness check', responses: { '200': { description: 'API is alive' } } } },
      '/health/ready': { get: { tags: ['Health'], summary: 'Readiness and database check', responses: { '200': { description: 'API is ready' }, '500': { description: 'Dependency unavailable' } } } },
      '/auth/login': {
        post: { tags: ['Authentication'], summary: 'Sign in', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } }, responses: { '200': { description: 'Authenticated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/TokenPair' } } } } } }, '401': { description: 'Invalid credentials' }, '429': { description: 'Too many attempts' } } },
      },
      '/auth/refresh': {
        post: { tags: ['Authentication'], summary: 'Rotate refresh token', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } } } }, responses: { '200': { description: 'New token pair' }, '401': { description: 'Invalid token' } } },
      },
      '/auth/logout': {
        post: { tags: ['Authentication'], summary: 'Revoke refresh token', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } } } }, responses: { '204': { description: 'Logged out' } } },
      },
      '/users/me': {
        get: { tags: ['Users'], summary: 'Get current user', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Current user' }, '401': { description: 'Unauthorized' } } },
      },
      '/integrations': {
        post: {
          tags: ['Integrations'],
          summary: 'Create external integration configuration',
          security: [{ bearerAuth: [] }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateIntegrationRequest' } } } },
          responses: {
            '201': { description: 'Integration created', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/IntegrationResponse' } } } } } },
            '400': { description: 'Validation or SSRF error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
          },
        },
        get: {
          tags: ['Integrations'],
          summary: 'List external integrations',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['siem', 'firewall', 'log_source', 'api'] } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'inactive', 'error', 'disabled'] } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'name', 'lastConnectedAt', 'status'] } },
            { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          ],
          responses: {
            '200': { description: 'List of integrations' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
          },
        },
      },
      '/integrations/{id}': {
        get: {
          tags: ['Integrations'],
          summary: 'Get integration by ID',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Integration details', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/IntegrationResponse' } } } } } },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
        patch: {
          tags: ['Integrations'],
          summary: 'Update integration configuration',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateIntegrationRequest' } } } },
          responses: {
            '200': { description: 'Integration updated' },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
      },
      '/integrations/{id}/test-connection': {
        post: {
          tags: ['Integrations'],
          summary: 'Test external connection to SIEM or Firewall',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: false, content: { 'application/json': { schema: { $ref: '#/components/schemas/TestConnectionRequest' } } } },
          responses: {
            '200': { description: 'Connection test outcome', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/TestConnectionResponse' } } } } } },
            '400': { description: 'SSRF rejected or no base URL configured' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
    },
  },
  apis: [],
});

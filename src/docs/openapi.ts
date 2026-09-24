import { env } from '../config/env.js';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SecuraAI API',
    version: '2.0.0',
    description: 'V2 database baseline. Business routes are added as V2 use cases are implemented.',
  },
  servers: [{ url: env.API_PREFIX, description: 'Current server' }],
  paths: {
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Check process liveness',
        responses: {
          '200': {
            description: 'Process is running',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      required: ['status', 'timestamp'],
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Check database readiness',
        responses: {
          '200': {
            description: 'Database is reachable',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      required: ['status', 'database', 'timestamp'],
                      properties: {
                        status: { type: 'string', example: 'ready' },
                        database: { type: 'string', example: 'up' },
                        timestamp: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          '500': { description: 'Database is unavailable' },
        },
      },
    },
  },
} as const;

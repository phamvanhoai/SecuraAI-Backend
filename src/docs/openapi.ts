import { env } from '../config/env.js';
import { pendingV2Paths } from './pending-v2.openapi.js';

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SecuraAI API',
    version: '2.0.0',
    description:
      'V2 database baseline. Migrated endpoints are active; historical V1 URLs pending migration return HTTP 501.',
  },
  servers: [{ url: env.API_PREFIX, description: 'Current server' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    ...pendingV2Paths,
    '/event-sources': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'List configured event sources',
        description:
          'Retrieve a paginated list of all configured event sources. Restricted to ADMIN and SECURITY_OFFICER roles.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'sourceType', in: 'query', schema: { type: 'string', maxLength: 100 } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
          },
          {
            name: 'sortBy',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['name', 'sourceType', 'status', 'updatedAt', 'createdAt'],
              default: 'updatedAt',
            },
          },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Paginated list of configured event sources' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
      post: {
        tags: ['Event Ingestion'],
        summary: 'Register a normalized event source',
        description:
          'Creates a new normalized event source (such as Wazuh/SIEM) with supported event families. Requires an active Admin or Security Officer account.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'sourceType', 'ingestionMethod', 'eventFamilies'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 255 },
                  sourceType: { type: 'string', minLength: 1, maxLength: 100 },
                  endpoint: { type: 'string', nullable: true },
                  ingestionMethod: { type: 'string', enum: ['API', 'FILE'] },
                  authenticationType: { type: 'string', nullable: true },
                  status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
                  description: { type: 'string', nullable: true },
                  eventFamilies: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'],
                    },
                    minItems: 1,
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Event source registered successfully' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '422': { description: 'Validation failed' },
        },
      },
    },
    '/event-sources/{id}': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'Get event source details',
        description:
          'Display comprehensive configuration details of a specific event source, including endpoint URLs, supported event families, and ingestion settings, while masking sensitive credentials. Restricted to ADMIN and SECURITY_OFFICER roles.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Comprehensive event source configuration and masked credential details' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '404': { description: 'Event source not found' },
          '422': { description: 'Invalid event source ID format' },
        },
      },
      put: {
        tags: ['Event Ingestion'],
        summary: 'Update event source configuration',
        description:
          'Update the connection and ingestion configuration of a registered event source. System identifier fields (id, sourceType, createdBy, createdAt) remain immutable. Restricted to ADMIN and SECURITY_OFFICER roles.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 255 },
                  endpoint: { type: 'string', nullable: true },
                  ingestionMethod: { type: 'string', enum: ['API', 'FILE'] },
                  authenticationType: { type: 'string', nullable: true },
                  status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
                  description: { type: 'string', nullable: true },
                  eventFamilies: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'],
                    },
                    minItems: 1,
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Event source configuration updated successfully' },
          '400': { description: 'Bad request or missing required fields' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '404': { description: 'Event source not found' },
          '409': { description: 'An event source with this name already exists' },
          '422': { description: 'Validation failed' },
        },
      },
      patch: {
        tags: ['Event Ingestion'],
        summary: 'Partially update event source configuration',
        description:
          'Partially update the connection and ingestion configuration of a registered event source. Restricted to ADMIN and SECURITY_OFFICER roles.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 255 },
                  endpoint: { type: 'string', nullable: true },
                  ingestionMethod: { type: 'string', enum: ['API', 'FILE'] },
                  authenticationType: { type: 'string', nullable: true },
                  status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
                  description: { type: 'string', nullable: true },
                  eventFamilies: {
                    type: 'array',
                    items: {
                      type: 'string',
                      enum: ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'],
                    },
                    minItems: 1,
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Event source configuration updated successfully' },
          '400': { description: 'Bad request or missing required fields' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '404': { description: 'Event source not found' },
          '409': { description: 'An event source with this name already exists' },
          '422': { description: 'Validation failed' },
        },
      },
    },
    '/event-sources/test-connection': {
      post: {
        tags: ['Event Ingestion'],
        summary: 'Test event source configuration and connection',
        description:
          'Test and verify the connection and authentication configuration of a Wazuh event source, displaying diagnostic results (success/failure, latency, status code, metadata) to validate settings before saving. Restricted to ADMIN and SECURITY_OFFICER roles.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['endpoint'],
                properties: {
                  endpoint: { type: 'string', minLength: 1, maxLength: 2048, example: 'https://192.168.56.101:55000' },
                  username: { type: 'string', maxLength: 255, example: 'wazuh-wui' },
                  password: { type: 'string', maxLength: 255, example: 'secret_password' },
                  verifySsl: { type: 'boolean', default: true },
                  timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000, default: 5000 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Connection test diagnostic results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        connected: { type: 'boolean' },
                        statusCode: { type: 'integer', nullable: true },
                        latencyMs: { type: 'number' },
                        message: { type: 'string' },
                        provider: { type: 'string' },
                        details: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            title: { type: 'string', nullable: true },
                            apiVersion: { type: 'string', nullable: true },
                            hostname: { type: 'string', nullable: true },
                          },
                        },
                        verifySslWarning: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '422': { description: 'Validation failed' },
        },
      },
    },
    '/event-sources/{id}/test-connection': {
      post: {
        tags: ['Event Ingestion'],
        summary: 'Test connection of an existing registered event source',
        description:
          'Test and verify the live connection of an existing registered event source using its configured endpoint and optional credentials override. Restricted to ADMIN and SECURITY_OFFICER roles.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string', maxLength: 255 },
                  password: { type: 'string', maxLength: 255 },
                  verifySsl: { type: 'boolean' },
                  timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000, default: 5000 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Connection test diagnostic results' },
          '400': { description: 'Event source has no endpoint configured' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '404': { description: 'Event source not found' },
          '422': { description: 'Validation failed' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/submit': {
      post: {
        tags: ['Policies'],
        summary: 'Submit an owned policy draft for Admin review',
        description:
          'Moves an owned V2 policy version from DRAFT to IN_REVIEW. Requires an active Security Officer account. Concurrent or repeated submissions are rejected.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'policyId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'versionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Policy draft submitted for review' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role or draft ownership required' },
          '404': { description: 'Policy draft not found' },
          '409': { description: 'Policy version is not a current draft or changed concurrently' },
          '422': { description: 'Invalid policy or version identifier' },
        },
      },
    },
    '/compliance/policies/drafts/mine': {
      get: {
        tags: ['Policies'],
        summary: 'List policy drafts owned by the current Security Officer',
        description:
          'Returns a bounded, searchable page of V2 draft policy versions owned and authored by the active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Paginated policy draft list' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/compliance/policies/drafts/reviewable': {
      get: {
        tags: ['Policy Management'],
        summary: 'List submitted policy drafts available to Admin reviewers',
        description:
          'Returns bounded V2 policies whose latest matching version is in review or waiting approval. Requires an active Admin account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          {
            name: 'sortBy',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['policyCode', 'title', 'updatedAt'],
              default: 'updatedAt',
            },
          },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Paginated submitted policy draft list' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/review': {
      get: {
        tags: ['Policy Management'],
        summary: 'View a submitted policy draft',
        description:
          'Returns the content and details of a V2 policy version submitted for review. Requires an active Admin account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'policyId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'versionId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Submitted policy draft details and content' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '404': { description: 'Submitted policy draft not found' },
          '422': { description: 'Invalid policy or version ID' },
        },
      },
    },
    '/anomaly-detections/runs': {
      post: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Run anomaly detection over unprocessed normalized events',
        description:
          'Requires an active Security Officer account and a deployed model version. Each event is evaluated once per model version; anomalous detections create alerts atomically.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  lookbackHours: { type: 'integer', minimum: 1, maximum: 720, default: 24 },
                  maxEvents: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Detection batch completed and persisted' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '409': { description: 'No deployed anomaly detection model is available' },
          '422': { description: 'Invalid run options' },
          '429': { description: 'Too many detection run requests' },
        },
      },
    },
    '/ai-alerts': {
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'View AI-generated anomaly alerts in near real time',
        description:
          'Returns a bounded, filterable page of V2 anomaly alerts. Requires an active Security Officer account. Clients may poll using detectedAfter and the returned serverTime watermark.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['new', 'reviewing', 'confirmed', 'false_positive', 'resolved', 'dismissed'],
            },
          },
          { name: 'detectedAfter', in: 'query', schema: { type: 'string', format: 'date-time' } },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Paginated AI alert feed with a serverTime polling watermark' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/ai-alerts/thresholds': {
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'List custom alert thresholds by asset',
        description:
          'Returns paginated asset-specific anomaly thresholds. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
        ],
        responses: {
          '200': { description: 'Paginated custom asset thresholds' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/ai-alerts/thresholds/assets/options': {
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'List active assets available for custom alert thresholds',
        description:
          'Returns a bounded list of active V2 assets for the custom threshold selector. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Active asset options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
        },
      },
    },
    '/ai-alerts/thresholds/{assetId}': {
      put: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Set a custom alert threshold for an asset',
        description:
          'Creates or replaces the active asset-specific anomaly threshold used by subsequent detection runs. Requires an active Security Officer account.',
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
              schema: {
                type: 'object',
                required: ['threshold'],
                additionalProperties: false,
                properties: {
                  threshold: { type: 'number', minimum: 0.01, maximum: 1 },
                  riskLevelMin: {
                    type: ['string', 'null'],
                    enum: ['low', 'medium', 'high', 'critical', null],
                  },
                  enabled: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Custom asset threshold saved' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Active asset not found' },
          '409': { description: 'No deployed anomaly detection model is available' },
          '422': { description: 'Invalid asset ID or request body' },
        },
      },
    },
    '/ai-alerts/{alertId}/feedback': {
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'View reliability feedback for an AI alert',
        description:
          'Returns bounded V2 alert triage history. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'alertId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Paginated feedback history' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'AI alert not found' },
          '422': { description: 'Invalid path or query parameters' },
        },
      },
      post: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Provide reliability feedback for an AI alert',
        description:
          'Records an analyst assessment without changing alert status. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'alertId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['feedbackLabel'],
                additionalProperties: false,
                properties: {
                  feedbackLabel: {
                    type: 'string',
                    enum: ['confirmed_incident', 'false_positive', 'needs_review'],
                  },
                  comment: { type: 'string', maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Reliability feedback recorded' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'AI alert not found' },
          '422': { description: 'Invalid request body or alert ID' },
        },
      },
    },
    '/ai-alerts/{alertId}/confirm-incident': {
      post: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Confirm an AI alert as a security incident',
        description:
          'Atomically records triage, creates a linked finding and incident, and marks the alert confirmed. Repeated calls return the existing incident. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'alertId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { comment: { type: 'string', maxLength: 2000 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Alert confirmed and linked incident returned' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'AI alert not found' },
          '422': { description: 'Invalid request body or alert ID' },
        },
      },
    },
    '/ai-alerts/{alertId}/false-positive': {
      post: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Mark an AI alert as a false positive',
        description:
          'Atomically records FALSE_POSITIVE triage feedback and dismisses the alert for model improvement. Repeated calls are idempotent; confirmed incidents are rejected. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'alertId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: { comment: { type: 'string', maxLength: 2000 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Alert marked as false positive or already dismissed' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'AI alert not found' },
          '409': { description: 'Alert is already linked to a confirmed security incident' },
          '422': { description: 'Invalid request body or alert ID' },
        },
      },
    },
    '/ai-alerts/{alertId}/explanation': {
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'View the XAI explanation and AI-suggested risk level',
        description:
          'Explains a V2 anomaly detection using its score, model threshold, suggested alert severity and ranked feature contributions. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'alertId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'AI explanation, feature contributions and suggested risk level' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'AI alert not found' },
          '422': { description: 'Invalid alert ID' },
        },
      },
    },
    '/ai-alerts/metrics': {
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Get 24-hour AI alert metrics',
        description:
          'Returns all dashboard alert counters in one aggregate query. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Aggregated total, new, reviewing and confirmed alert counts' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
        },
      },
    },
    '/ai-alerts/models': {
      ...pendingV2Paths['/ai-alerts/models'],
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'View model versions and latest evaluation metrics',
        description:
          'Returns paginated V2 anomaly model versions with dataset details and the latest recorded evaluation. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'modelName', in: 'query', schema: { type: 'string', maxLength: 150 } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['development', 'validated', 'deployed', 'retired'],
            },
          },
        ],
        responses: {
          '200': { description: 'Model versions and their latest evaluation metrics' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate a V2 account and create a refresh session',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                additionalProperties: false,
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 1, maxLength: 128 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Access and refresh token pair' },
          '401': { description: 'Invalid credentials or inactive account' },
          '422': { description: 'Invalid request body' },
          '429': { description: 'Too many attempts' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Authentication'],
        summary: 'Rotate a valid refresh session',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                additionalProperties: false,
                properties: { refreshToken: { type: 'string', minLength: 32, maxLength: 256 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Rotated access and refresh token pair' },
          '401': { description: 'Invalid or expired refresh token' },
          '422': { description: 'Invalid request body' },
          '429': { description: 'Too many attempts' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Revoke a refresh session',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                additionalProperties: false,
                properties: { refreshToken: { type: 'string', minLength: 32, maxLength: 256 } },
              },
            },
          },
        },
        responses: {
          '204': { description: 'Refresh session revoked or already absent' },
          '422': { description: 'Invalid request body' },
        },
      },
    },
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Get the current active V2 user session profile',
        description:
          'Requires a valid access token. The permissions field contains conservative role-derived frontend capability names from the Project Tracking WBS, not stored per-user grants. V2 has no detailed permission or MFA models yet.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user profile',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      required: [
                        'id',
                        'email',
                        'fullName',
                        'status',
                        'mustChangePassword',
                        'mfaEnabled',
                        'roles',
                        'permissions',
                      ],
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        fullName: { type: 'string' },
                        status: { type: 'string', enum: ['ACTIVE'] },
                        mustChangePassword: { type: 'boolean', example: false },
                        mfaEnabled: { type: 'boolean', example: false },
                        roles: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: ['code', 'name'],
                            properties: { code: { type: 'string' }, name: { type: 'string' } },
                          },
                        },
                        permissions: {
                          type: 'array',
                          items: { type: 'string' },
                          description:
                            'Role-derived UI capability names; backend handlers must enforce their own authorization.',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Missing, invalid or expired token, or inactive account' },
        },
      },
    },
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

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
    '/users/access-assignment-options': {
      get: {
        tags: ['Users'],
        summary: 'List role and access-scope assignment options',
        description:
          'Returns the four V2 roles, allow-listed supplemental permission codes, and active business services and assets that may target a scope. Active Admin account required.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Assignment options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Administrator required' },
        },
      },
    },
    '/users/{userId}/access-assignment': {
      get: {
        tags: ['Users'],
        summary: 'View a user role, scopes, and ownership summary',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Current access assignment' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Administrator required' },
          '404': { description: 'User not found' },
        },
      },
      put: {
        tags: ['Users'],
        summary: 'Replace a user role and supplemental access scopes',
        description:
          'Atomically replaces the single V2 role and supplemental permission scopes. Ownership remains managed by its business module. Role changes revoke active refresh sessions.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
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
                required: ['role', 'scopes'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': { description: 'Assignment saved' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Administrator required' },
          '404': { description: 'User not found' },
          '409': { description: 'Protected administrator invariant' },
          '422': { description: 'Invalid assignment or target' },
        },
      },
    },
    '/assets': {
      ...pendingV2Paths['/assets'],
      get: {
        tags: ['IT Asset Management'],
        summary: 'View the IT asset list',
        description:
          'Returns a searchable, filterable, paginated asset directory. Security Officers can view all assets; other active users can view only assets assigned to them as Asset Owner.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'assetType', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'criticality', in: 'query', schema: { type: 'string', maxLength: 50 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'archived'] } },
        ],
        responses: {
          '200': { description: 'Paginated IT asset list scoped to the caller' },
          '401': { description: 'Authentication required' },
          '422': { description: 'Invalid filters' },
        },
      },
      post: {
        tags: ['IT Asset Management'],
        summary: 'Create an IT asset',
        description:
          'Registers an IT asset and optionally links its owner, business service, dependencies, and event sources. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['assetCode', 'name', 'assetType', 'criticality', 'dataClassification'],
                properties: {
                  assetCode: { type: 'string', maxLength: 100 },
                  name: { type: 'string', maxLength: 255 },
                  assetType: { type: 'string', maxLength: 100 },
                  ownerUserId: { type: 'string', format: 'uuid' },
                  businessServiceId: { type: 'string', format: 'uuid' },
                  criticality: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  dataClassification: { type: 'string', maxLength: 50 },
                  description: { type: 'string', maxLength: 10000 },
                  dependencies: { type: 'array', maxItems: 50 },
                  eventSourceIds: {
                    type: 'array',
                    maxItems: 50,
                    items: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'IT asset created' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '409': { description: 'Asset code already exists' },
          '422': { description: 'Invalid input or unavailable relationship' },
        },
      },
    },
    '/assets/create-options': {
      get: {
        tags: ['IT Asset Management'],
        summary: 'Get IT asset creation options',
        description:
          'Returns bounded active owners, business services, assets, and event sources for the create form. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Asset creation options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
        },
      },
    },
    '/assets/{assetId}': {
      ...pendingV2Paths['/assets/{assetId}'],
      delete: {
        tags: ['IT Asset Management'],
        summary: 'Archive an IT asset',
        description:
          'Marks an asset as archived without deleting its details or relationships. Requires an active Security Officer.',
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
          '204': { description: 'Asset archived' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Asset not found' },
          '409': { description: 'Asset is already archived' },
        },
      },
      patch: {
        tags: ['IT Asset Management'],
        summary: 'Edit an IT asset',
        description:
          'Updates the asset name, type, and description. Ownership, classification, business service, dependencies, event sources, and lifecycle status are managed by their dedicated operations. Requires an active Security Officer.',
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
                additionalProperties: false,
                required: ['name', 'assetType', 'description'],
                properties: {
                  name: { type: 'string', maxLength: 255 },
                  assetType: { type: 'string', maxLength: 100 },
                  description: { type: 'string', maxLength: 10000, nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated IT asset' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Asset not found' },
          '409': { description: 'Archived asset cannot be edited' },
          '422': { description: 'Invalid input' },
        },
      },
      get: {
        tags: ['IT Asset Management'],
        summary: 'View IT asset details',
        description:
          'Returns asset identity, ownership, business service, dependencies, controls, event sources, risks, and incidents. Security Officers can view any asset; an Asset Owner can view only assets assigned to them.',
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
          '200': { description: 'Detailed IT asset record' },
          '401': { description: 'Authentication required' },
          '403': { description: 'The caller is not the assigned Asset Owner' },
          '404': { description: 'Asset not found' },
          '422': { description: 'Invalid asset ID' },
        },
      },
    },
    '/assets/{assetId}/owner': {
      put: {
        tags: ['IT Asset Management'],
        summary: 'Assign an asset owner',
        description:
          'Assigns, reassigns, or removes the responsible owner of an active IT asset. Requires an active Security Officer.',
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
          '200': { description: 'Owner assignment result' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Asset not found' },
          '409': { description: 'Archived asset cannot be reassigned' },
          '422': { description: 'Invalid or inactive owner' },
        },
      },
    },
    '/assets/{assetId}/classify-criticality': {
      post: {
        tags: ['IT Asset Management'],
        summary: 'Classify asset criticality and data sensitivity',
        description:
          'Calculates business criticality from CIA and business-impact scores and records the selected data classification. Requires an active Security Officer.',
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
                additionalProperties: false,
                required: [
                  'confidentialityImpact',
                  'integrityImpact',
                  'availabilityImpact',
                  'businessImpact',
                  'dataClassification',
                ],
                properties: {
                  confidentialityImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  integrityImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  availabilityImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  businessImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  dataClassification: {
                    type: 'string',
                    enum: ['public', 'internal', 'confidential', 'restricted'],
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated criticality and data classification' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Asset not found' },
          '409': { description: 'Archived asset cannot be classified' },
          '422': { description: 'Invalid classification input' },
        },
      },
    },
    '/assets/{assetId}/context': {
      put: {
        tags: ['IT Asset Management'],
        summary: 'Link asset business context',
        description:
          'Replaces the active asset business service, dependencies, and event-source links. Requires an active Security Officer.',
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
                additionalProperties: false,
                required: ['businessServiceId', 'dependencyIds', 'eventSourceIds'],
                properties: {
                  businessServiceId: { type: 'string', format: 'uuid', nullable: true },
                  dependencyIds: {
                    type: 'array',
                    maxItems: 50,
                    items: { type: 'string', format: 'uuid' },
                  },
                  eventSourceIds: {
                    type: 'array',
                    maxItems: 50,
                    items: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated asset context links' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Asset not found' },
          '409': { description: 'Archived asset cannot be linked' },
          '422': { description: 'Invalid or unavailable relationship' },
        },
      },
    },
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
          'Creates a normalized event source such as Wazuh/SIEM. Requires an active Admin or Security Officer account.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
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
    '/integrations/wazuh/events': {
      post: {
        tags: ['Event Ingestion'],
        summary: 'Ingest a normalized Wazuh event',
        description:
          'Accepts one normalized event from the configured Wazuh integration. Requires the X-SecuraAI-Ingest-Key header or a bearer ingestion token.',
        parameters: [
          {
            name: 'X-SecuraAI-Ingest-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '201': { description: 'Event ingested' },
          '401': { description: 'Ingestion token missing' },
          '403': { description: 'Ingestion token invalid' },
          '422': { description: 'Invalid normalized event' },
          '503': { description: 'Wazuh ingestion is not configured' },
        },
      },
    },
    '/incidents': {
      ...pendingV2Paths['/incidents'],
      get: {
        tags: ['Incident Management'],
        summary: 'List security incidents',
        description:
          'Returns a searchable, paginated list of V2 security incidents for active Security Officers and Executives.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
          { name: 'search', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          {
            name: 'severity',
            in: 'query',
            schema: { type: 'string', minLength: 1, maxLength: 50 },
          },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'open',
                'triage',
                'containment',
                'eradication',
                'recovery',
                'lessons_learned',
                'closed',
              ],
            },
          },
        ],
        responses: {
          '200': { description: 'Paginated incident list' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer or Executive role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/incidents/{incidentId}': {
      get: {
        tags: ['Incident Management'],
        summary: 'View security incident details',
        description:
          'Returns core incident details, responsible users, timestamps, and related-record counts from the V2 database.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Incident details' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer or Executive role required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid incident identifier' },
        },
      },
    },
    '/incidents/{incidentId}/assets/{assetId}': {
      delete: {
        tags: ['Incident Management'],
        summary: 'Unlink an asset from an incident',
        description:
          'Removes an existing incident-to-asset relationship. The incident and asset records are not deleted. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'assetId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Asset unlinked from incident' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident or incident-asset link not found' },
          '422': { description: 'Invalid identifier' },
        },
      },
    },
    '/incidents/{incidentId}/assets/options': {
      get: {
        tags: ['Incident Management'],
        summary: 'Search incident asset options',
        description:
          'Returns a bounded, paginated list of linked or unlinked active assets. Search matches asset code or name. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          {
            name: 'scope',
            in: 'query',
            schema: { type: 'string', enum: ['linked', 'unlinked'], default: 'unlinked' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
        ],
        responses: {
          '200': { description: 'Paginated incident asset options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid search or pagination parameters' },
        },
      },
    },
    '/incidents/{incidentId}/controls/options': {
      get: {
        tags: ['Incident Management'],
        summary: 'Search incident control options',
        description:
          'Returns a bounded, paginated list of linked or unlinked controls. Search matches control code or name. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          {
            name: 'scope',
            in: 'query',
            schema: { type: 'string', enum: ['linked', 'unlinked'], default: 'unlinked' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
        ],
        responses: {
          '200': { description: 'Paginated incident control options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid search or pagination parameters' },
        },
      },
    },
    '/incidents/{incidentId}/controls/{controlId}': {
      delete: {
        tags: ['Incident Management'],
        summary: 'Unlink a control from an incident',
        description:
          'Removes an existing incident-to-control relationship without deleting either record. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'controlId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Control unlinked from incident' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident or incident-control link not found' },
          '422': { description: 'Invalid identifier' },
        },
      },
    },
    '/incidents/{incidentId}/risks/options': {
      get: {
        tags: ['Incident Management'],
        summary: 'Search incident risk options',
        description:
          'Returns paginated linked or unlinked non-archived risks matching risk code or title.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'scope', in: 'query', schema: { type: 'string', enum: ['linked', 'unlinked'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50 } },
        ],
        responses: {
          '200': { description: 'Paginated incident risk options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid parameters' },
        },
      },
    },
    '/incidents/{incidentId}/risks/{riskId}': {
      delete: {
        tags: ['Incident Management'],
        summary: 'Unlink a risk from an incident',
        description: 'Removes the relationship without deleting the incident or risk.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'riskId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '204': { description: 'Risk unlinked' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer required' },
          '404': { description: 'Link not found' },
          '422': { description: 'Invalid identifier' },
        },
      },
    },
    '/compliance/policies/version-history': {
      get: {
        tags: ['Policy Management'],
        summary: 'List published policy version history',
        description:
          'Returns published and superseded V2 policy versions for active Admins and Security Officers. Draft and approval-workflow versions are excluded.',
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
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['all', 'published', 'archived'],
              default: 'all',
            },
          },
        ],
        responses: {
          '200': { description: 'Paginated published policy version history' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/history': {
      get: {
        tags: ['Policy Management'],
        summary: 'View a published policy version from history',
        description:
          'Returns content and audit metadata for one published or superseded V2 policy version to an active Admin or Security Officer.',
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
          '200': { description: 'Published policy version details' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '404': { description: 'Published policy version not found' },
          '422': { description: 'Invalid identifiers' },
        },
      },
    },
    '/compliance/policies/published/mine': {
      get: {
        tags: ['Policy Management'],
        summary: 'List owned published policies',
        description:
          'Returns current published V2 policy versions owned by the active Security Officer, including content and publication details.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Owned published policy versions' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
        },
      },
    },
    '/compliance/policies/acknowledgements/mine': {
      get: {
        tags: ['Policy Management'],
        summary: 'List published policies for the current Employee',
        description:
          'Returns current active V2 policies and their published versions with the Employee reading status.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          { name: 'departmentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['all', 'pending', 'acknowledged'], default: 'all' },
          },
        ],
        responses: {
          '200': { description: 'Paginated published policy list' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Employee role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/acknowledgement': {
      get: {
        tags: ['Policy Management'],
        summary: 'View a published policy version',
        description:
          'Returns the content and details of the current published V2 policy version to an active Employee.',
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
          '200': { description: 'Published policy content and details' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Employee role required' },
          '404': { description: 'Published policy not found' },
          '422': { description: 'Invalid identifiers' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/acknowledgements': {
      post: {
        tags: ['Policy Management'],
        summary: 'Acknowledge a published policy version',
        description:
          'Records that the active Employee has read and understood the current published V2 policy version. Repeated requests return the existing acknowledgement.',
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
          '200': { description: 'Acknowledgement recorded or existing acknowledgement returned' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Employee role required' },
          '404': { description: 'Current published policy version not found' },
          '422': { description: 'Invalid identifiers' },
        },
      },
    },
    '/compliance/policies/rejected': {
      get: {
        tags: ['Policy Management'],
        summary: 'List rejected policy versions',
        description:
          'Returns a searchable, paginated audit list of rejected V2 policy versions with the recorded reason and Admin decision details. Active Admins see all records; active Security Officers see only policies they own.',
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
          '200': { description: 'Paginated rejected policy list' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/reject': {
      post: {
        tags: ['Policy Management'],
        summary: 'Reject a submitted policy draft',
        description:
          'Records an Admin REJECTED decision with a required reason and moves the submitted V2 policy version to REJECTED. Rejection is final for that version and does not publish it or return it to draft.',
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
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['reason'],
                properties: { reason: { type: 'string', minLength: 3, maxLength: 5000 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Policy version rejected and decision recorded' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '404': { description: 'Submitted policy draft not found' },
          '409': { description: 'Policy draft changed concurrently' },
          '422': { description: 'Invalid identifiers or rejection reason' },
        },
      },
    },
    '/compliance/policies': {
      post: {
        tags: ['Policy Management'],
        summary: 'Create a policy draft',
        description:
          'Creates a V2 policy and its first draft version in one transaction. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['policyCode', 'title', 'versionNumber', 'content'],
                properties: {
                  policyCode: {
                    type: 'string',
                    minLength: 2,
                    maxLength: 50,
                    pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$',
                  },
                  title: { type: 'string', minLength: 3, maxLength: 255 },
                  description: { type: 'string', maxLength: 2000 },
                  versionNumber: { type: 'string', minLength: 1, maxLength: 30 },
                  content: { type: 'string', minLength: 1, maxLength: 500000 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Policy draft created' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '409': { description: 'Policy code already exists' },
          '422': { description: 'Invalid policy draft input' },
        },
      },
    },
    '/compliance/policies/{policyId}/drafts/{versionId}': {
      ...pendingV2Paths['/compliance/policies/{policyId}/drafts/{versionId}'],
      patch: {
        tags: ['Policies'],
        summary: 'Edit an owned policy draft',
        description:
          'Updates policy metadata and draft-version content for an active Security Officer who owns and authored the V2 draft. Only DRAFT policies and versions are editable.',
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
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                minProperties: 1,
                properties: {
                  title: { type: 'string', minLength: 3, maxLength: 255 },
                  description: { type: 'string', maxLength: 2000, nullable: true },
                  versionNumber: { type: 'string', minLength: 1, maxLength: 30 },
                  content: { type: 'string', minLength: 1, maxLength: 500000 },
                  changeSummary: { type: 'string', maxLength: 5000, nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated policy draft' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role and draft ownership required' },
          '404': { description: 'Policy draft not found' },
          '409': { description: 'Draft is no longer editable or version number conflicts' },
          '422': { description: 'Invalid identifiers or update fields' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/revision-requests': {
      post: {
        tags: ['Policy Management'],
        summary: 'Request revision of a submitted policy draft',
        description:
          'Records an Admin REVISION_REQUESTED decision with a required comment and returns the submitted version to DRAFT so its Security Officer owner can revise and resubmit it.',
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
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['comment'],
                properties: { comment: { type: 'string', minLength: 3, maxLength: 5000 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Revision requested and policy version returned to draft' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '404': { description: 'Submitted policy draft not found' },
          '409': { description: 'Policy draft changed concurrently' },
          '422': { description: 'Invalid identifiers or revision comment' },
        },
      },
    },
    '/event-sources/{id}/import': {
      post: {
        tags: ['Event Ingestion'],
        summary: 'Import normalized event records from file or batch upload',
        description:
          'Validates and imports a batch of normalized security events from JSON or CSV files into an active event source. Records are persisted in normalized_events and invalid records in invalid_events.',
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
                required: ['events'],
                properties: {
                  fileName: { type: 'string', maxLength: 255 },
                  fileFormat: { type: 'string', enum: ['JSON', 'CSV'], default: 'JSON' },
                  eventFamily: {
                    type: 'string',
                    enum: ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'],
                  },
                  events: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 5000,
                    items: {
                      type: 'object',
                      required: ['eventType', 'occurredAt'],
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Batch import processed with execution statistics and error details',
          },
          '400': { description: 'Event source is inactive or invalid import payload' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin or Security Officer role required' },
          '404': { description: 'Event source not found' },
          '422': { description: 'Validation failed' },
        },
      },
    },
    '/event-sources/batches/{batchId}': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'Get import batch summary report',
        description:
          'Retrieves summary execution statistics for a specific event ingestion batch, including accepted/rejected records counts and status.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Import batch summary report' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Batch not found' },
          '422': { description: 'Invalid batch ID' },
        },
      },
    },
    '/event-sources/batches/{batchId}/invalid-events': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'List invalid events for an import batch',
        description:
          'Retrieves a paginated list of rejected/invalid events with specific validation error codes, reasons, and raw payloads.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'batchId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'errorCode', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Paginated list of invalid event records' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Batch not found' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/event-sources/{id}/batches': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'List import batches for an event source',
        description:
          'Retrieves historical import batches and their statuses for the given event source.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
        ],
        responses: {
          '200': { description: 'Paginated list of import batches for event source' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Event source not found' },
          '422': { description: 'Invalid parameters' },
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
          'Returns bounded V2 policies whose latest workflow version is in review, waiting approval, or approved and ready to publish. Requires an active Admin account.',
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
      post: {
        tags: ['Policy Management'],
        summary: 'Complete review of a submitted policy draft',
        description:
          'Records an auditable REVIEWED decision and moves the V2 policy version from IN_REVIEW to WAITING_APPROVAL. Requires an active Admin account.',
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
          '200': { description: 'Policy review recorded; version is waiting for approval' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '404': { description: 'Submitted policy draft not found' },
          '409': { description: 'Draft was already reviewed or changed concurrently' },
          '422': { description: 'Invalid policy or version ID' },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/publish': {
      post: {
        tags: ['Policy Management'],
        summary: 'Publish an approved policy version',
        description:
          'Atomically marks the approved V2 version as PUBLISHED, supersedes the prior published version when present, activates the policy, and assigns current_published_version_id. Requires an active Admin account.',
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
          '200': { description: 'Policy version published as the current official version' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '404': { description: 'Approved policy version not found' },
          '409': { description: 'Version changed concurrently before publication' },
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
              enum: [
                'new',
                'reviewing',
                'needs_investigation',
                'confirmed',
                'false_positive',
                'resolved',
                'dismissed',
              ],
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
          'Returns up to 50 active V2 assets matching an optional code or name search for the threshold selector. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
        ],
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
    '/ai-alerts/{alertId}/triage/start': {
      post: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Start analyst triage for an AI alert',
        description:
          'Atomically assigns a new alert to the authenticated Security Officer and moves it into triage. Repeating the request by the assigned analyst is idempotent; competing claims return a conflict.',
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
          '200': { description: 'Triage assignment and start time returned' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'AI alert not found' },
          '409': { description: 'Alert is assigned to another analyst or no longer new' },
          '422': { description: 'Invalid alert ID' },
        },
      },
    },
    '/ai-alerts/{alertId}/feedback': {
      get: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'View reliability feedback for an AI alert',
        description:
          'Returns bounded V2 alert triage history including the feedback reason, analyst identity, recorded time and model version used for each decision. Requires an active Security Officer account.',
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
          '200': {
            description:
              'Paginated feedback history with reason, analyst, recorded time and model version',
          },
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
          'Confirms an assigned alert under triage or further investigation as a true positive, then atomically records the decision, creates a linked finding and incident, and marks the alert confirmed. Repeated calls by the assigned analyst return the existing incident.',
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
          '409': {
            description:
              'Triage has not started, the alert belongs to another analyst, or its status changed concurrently',
          },
          '422': { description: 'Invalid request body or alert ID' },
        },
      },
    },
    '/ai-alerts/{alertId}/false-positive': {
      post: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Mark an AI alert as a false positive',
        description:
          'Dismisses an assigned alert under triage or further investigation as a false positive and records the analyst decision. Repeated calls by the assigned analyst are idempotent; confirmed incidents are rejected.',
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
          '409': {
            description:
              'Triage has not started, the alert belongs to another analyst, is confirmed, or changed concurrently',
          },
          '422': { description: 'Invalid request body or alert ID' },
        },
      },
    },
    '/ai-alerts/{alertId}/further-investigation': {
      post: {
        tags: ['AI Anomaly Detection & Alerts'],
        summary: 'Mark an AI alert as needing further investigation',
        description:
          'Moves an alert assigned to the authenticated analyst from active triage to further investigation and records the required reason. Repeated calls by the assigned analyst are idempotent.',
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
                required: ['reason'],
                additionalProperties: false,
                properties: {
                  reason: { type: 'string', minLength: 10, maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Alert marked as needing further investigation' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'AI alert not found' },
          '409': {
            description:
              'Triage has not started, the alert belongs to another analyst, or its status changed concurrently',
          },
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
    '/incidents/{incidentId}/control-weaknesses': {
      get: {
        tags: ['Information Security Incident Management'],
        summary: 'View control weakness history for an incident',
        description:
          'Returns a newest-first paginated history of control weaknesses recorded from the incident, including the affected control, severity, status, analyst and timestamps. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
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
        ],
        responses: {
          '200': { description: 'Paginated control weakness history' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid incident ID or pagination' },
        },
      },
      post: {
        tags: ['Information Security Incident Management'],
        summary: 'Record a control weakness from an incident',
        description:
          'Records a control weakness against a control already linked to the incident. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
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
                required: ['controlId', 'severity', 'description'],
                additionalProperties: false,
                properties: {
                  controlId: { type: 'string', format: 'uuid' },
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  description: { type: 'string', minLength: 20, maxLength: 5000 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Control weakness recorded' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident not found' },
          '409': { description: 'An open weakness already exists for this incident and control' },
          '422': { description: 'Invalid input or the control is not linked to the incident' },
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
          'Requires a valid access token. The permissions field contains conservative role-derived frontend capability names from the Project Tracking WBS, not stored per-user grants.',
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
                        'roles',
                        'permissions',
                      ],
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        fullName: { type: 'string' },
                        status: { type: 'string', enum: ['ACTIVE'] },
                        mustChangePassword: { type: 'boolean', example: false },
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
    '/users': {
      ...pendingV2Paths['/users'],
      get: {
        tags: ['Users'],
        summary: 'List V2 user accounts',
        description:
          'Active Admin only. Returns a searchable, filterable and paginated list from the V2 users table.',
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
            name: 'roleCode',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['ADMIN', 'SECURITY_OFFICER', 'EMPLOYEE', 'EXECUTIVE'],
            },
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['active', 'inactive', 'locked'] },
          },
        ],
        responses: {
          '200': { description: 'Paginated user list and status summary' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a V2 user account',
        description:
          'Active Admin only. Creates one active account, records an audit event, and emails a generated temporary password. V2 supports one role per account.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['email', 'fullName', 'role'],
                properties: {
                  email: { type: 'string', format: 'email', maxLength: 255 },
                  fullName: { type: 'string', minLength: 2, maxLength: 255 },
                  phone: { type: 'string', minLength: 3, maxLength: 30 },
                  employeeCode: { type: 'string', minLength: 1, maxLength: 50 },
                  departmentId: { type: 'string', format: 'uuid' },
                  role: {
                    type: 'string',
                    enum: ['SECURITY_OFFICER', 'EMPLOYEE', 'EXECUTIVE'],
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Account created and temporary password email sent' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '409': { description: 'Email already exists' },
          '422': { description: 'Invalid request body' },
          '503': { description: 'Email service unavailable or delivery failed' },
        },
      },
    },
    '/users/create-options': {
      get: {
        tags: ['Users'],
        summary: 'List active departments for user forms',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Active department options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
        },
      },
    },
    '/users/{userId}': {
      ...pendingV2Paths['/users/{userId}'],
      get: {
        tags: ['Users'],
        summary: 'View a V2 user account',
        description:
          'Active Admin only. Password hashes and Google subject identifiers are never returned.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'User account details' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '404': { description: 'User not found' },
          '422': { description: 'Invalid user identifier' },
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Edit a V2 user profile',
        description: 'Active Admin only. Updates the full name and records an audit event.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'userId',
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
                required: ['fullName', 'phone', 'employeeCode', 'departmentId', 'status'],
                properties: {
                  fullName: { type: 'string', minLength: 2, maxLength: 255 },
                  phone: { type: ['string', 'null'], minLength: 3, maxLength: 30 },
                  employeeCode: { type: ['string', 'null'], minLength: 1, maxLength: 50 },
                  departmentId: { type: ['string', 'null'], format: 'uuid' },
                  status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'LOCKED'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated user account details' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '404': { description: 'User not found' },
          '422': { description: 'Invalid request' },
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

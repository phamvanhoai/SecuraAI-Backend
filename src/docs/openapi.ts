import { env } from '../config/env.js';
import { controlCatalogPaths } from './control-catalog.openapi.js';
import { controlEvidencePaths } from './control-evidence.openapi.js';
import { pendingV2Paths } from './pending-v2.openapi.js';
import { businessServicesPaths } from './business-services.openapi.js';
import { notificationPaths } from './notifications.openapi.js';
import { auditPaths } from './audit.openapi.js';
import { systemLogPaths } from './system-logs.openapi.js';

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
    ...controlCatalogPaths,
    ...controlEvidencePaths,
    ...businessServicesPaths,
    ...notificationPaths,
    ...auditPaths,
    ...systemLogPaths,
    '/access-control/permissions': {
      get: {
        tags: ['Access Control'],
        summary: 'List the configurable permission catalog',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Paginated permission definitions grouped by module and operation',
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Detailed-permission read access required' },
        },
      },
    },
    '/access-control/roles': {
      ...pendingV2Paths['/access-control/roles'],
      get: {
        tags: ['Access Control'],
        summary: 'List fixed roles and their effective permission grants',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Paginated fixed-role permission configuration' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Administrator required' },
        },
      },
    },
    '/access-control/roles/{roleId}': {
      ...pendingV2Paths['/access-control/roles/{roleId}'],
      get: {
        tags: ['Access Control'],
        summary: 'View one fixed role and its permission grants',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'roleId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Role permission details' },
          '404': { description: 'Role not found' },
        },
      },
    },
    '/access-control/roles/{roleId}/permissions': {
      put: {
        tags: ['Access Control'],
        summary: 'Replace detailed permissions for a non-administrator role',
        description:
          'Uses optimistic concurrency, records the reason in the audit log, and revokes active sessions for affected users.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'roleId',
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
                required: ['permissionIds', 'expectedUpdatedAt', 'reason'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated role permissions' },
          '403': { description: 'Administrator required' },
          '409': { description: 'Role configuration changed since it was loaded' },
          '422': { description: 'Invalid permission or immutable administrator role' },
        },
      },
    },
    '/access-control/users/{userId}/permissions': {
      get: {
        tags: ['Access Control'],
        summary: 'View role grants, user overrides, and effective permissions',
        description:
          'Also returns whether the account is editable and the permission codes that may receive an explicit allow override for the target fixed role.',
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
          '200': { description: 'Effective user permissions' },
          '404': { description: 'User not found' },
        },
      },
      put: {
        tags: ['Access Control'],
        summary: 'Replace allow and deny overrides for one user',
        description:
          'Deny overrides take precedence over role grants. Administrator accounts are immutable, and administrator-only permissions cannot be allowed for another fixed role. The operation is audited and revokes the user active sessions.',
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
                required: ['allow', 'deny', 'reason'],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated effective user permissions' },
          '403': { description: 'Administrator required' },
          '422': {
            description:
              'Invalid or conflicting permissions, immutable administrator account, or administrator-only permission not allowed for the target role',
          },
        },
      },
    },
    '/risks/{riskId}/vulnerabilities': {
      post: {
        tags: ['Risks'],
        summary: 'Identify a vulnerability',
        security: [{ bearerAuth: [] }],
        description:
          'Active Security Officer required. Only OPEN/UNDER_TREATMENT risks without PENDING acceptance may change vulnerability context. Checks and writes are serialized with acceptance submission/decision. Controls are optional and must already belong to the risk. History and ratings are preserved; newer vulnerabilities require reassessment.',
        parameters: [
          {
            name: 'riskId',
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
                required: ['name', 'description', 'controlIds'],
                properties: {
                  name: { type: 'string', minLength: 2, maxLength: 255 },
                  description: { type: 'string', minLength: 3, maxLength: 3000 },
                  controlIds: {
                    type: 'array',
                    maxItems: 50,
                    uniqueItems: true,
                    items: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '{success:true,data:{id,name,description,controls,createdAt}}' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer required' },
          '404': { description: 'Risk not found' },
          '409': {
            description:
              'RISK_CONTEXT_LOCKED or VULNERABILITY_ALREADY_EXISTS; reload risk and review the reason',
          },
          '422': { description: 'Invalid input or controls not linked to risk' },
        },
      },
    },
    '/risks/{riskId}/acceptance': {
      post: {
        tags: ['Risks'],
        summary: 'Submit risk acceptance',
        security: [{ bearerAuth: [] }],
        description:
          'Assigned Risk Owner required. OPEN/UNDER_TREATMENT risk, eligible plan, no pending decision and a residual assessment newer than every vulnerability are required. Existing endpoint request body is unchanged. A copied target assessment cannot bypass review of stale context.',
        parameters: [
          {
            name: 'riskId',
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
                required: [
                  'residualLikelihood',
                  'residualImpact',
                  'assessmentReason',
                  'treatmentPlanId',
                  'treatmentPlanStatus',
                  'validUntil',
                  'acceptanceReason',
                ],
                properties: {
                  residualLikelihood: { type: 'integer', minimum: 1, maximum: 5 },
                  residualImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  assessmentReason: { type: 'string' },
                  treatmentPlanId: { type: 'string', format: 'uuid' },
                  treatmentPlanStatus: { type: 'string', enum: ['draft', 'active', 'completed'] },
                  validUntil: { type: 'string', format: 'date' },
                  acceptanceReason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Acceptance submitted' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Assigned Risk Owner required' },
          '404': { description: 'Risk not found' },
          '409': {
            description: 'RISK_REASSESSMENT_REQUIRED, RISK_CONTEXT_LOCKED or ACCEPTANCE_PENDING',
          },
          '422': { description: 'Invalid plan, actions, validity or input' },
        },
      },
    },
    '/risks': {
      get: {
        tags: ['Risks'],
        summary: 'View the risk register',
        security: [{ bearerAuth: [] }],
        description:
          'Security Officers and Executives read accessible risks; other actors are ownership-scoped. scope is null for historical unrecorded scope, {type:asset}, or {type:business_service,businessService:{id,name,status}}. assets are persisted risk links, not current service membership.',
        responses: {
          '200': { description: 'Bounded risk page including explicit scope' },
          '401': { description: 'Authentication required' },
          '422': { description: 'Invalid query' },
        },
      },
      post: {
        tags: ['Risks'],
        summary: 'Create Risk',
        security: [{ bearerAuth: [] }],
        description:
          'Active Security Officer required. Persists original scope and linked active assets atomically. Service membership never automatically changes saved risk scope. Active Employee owner and at least one active scope asset are required.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description', 'ownerUserId', 'reviewDate', 'scope'],
                properties: {
                  title: { type: 'string', minLength: 3, maxLength: 255 },
                  description: { type: 'string', minLength: 3, maxLength: 5000 },
                  ownerUserId: { type: 'string', format: 'uuid' },
                  reviewDate: { type: 'string', format: 'date' },
                  scope: {
                    oneOf: [
                      {
                        type: 'object',
                        required: ['type', 'assetId'],
                        properties: {
                          type: { type: 'string', enum: ['asset'] },
                          assetId: { type: 'string', format: 'uuid' },
                        },
                      },
                      {
                        type: 'object',
                        required: ['type', 'businessServiceId'],
                        properties: {
                          type: { type: 'string', enum: ['business_service'] },
                          businessServiceId: { type: 'string', format: 'uuid' },
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
          '201': { description: 'Risk created (not yet assessed)' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer required' },
          '409': { description: 'Scope changed; reload options' },
          '422': { description: 'Invalid owner, date or scope' },
        },
      },
    },
    '/risks/{riskId}': {
      get: {
        tags: ['Risks'],
        summary: 'View Risk detail',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'riskId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        description:
          'Returns explicit original scope and recorded assets, assessments, controls, plans and acceptance. Historical scope is null; never inferred from current service membership. vulnerabilityWorkflow exposes canIdentify (actor-scoped), blockedReason and assessmentReviewRequired; vulnerabilities include createdAt. Existing ratings remain historical when review is required.',
        responses: {
          '200': { description: 'Risk detail including scope' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Risk access denied' },
          '404': { description: 'Risk not found' },
        },
      },
    },
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
          'Registers an IT asset with an optional owner. Business service, criticality and data classification start as null; use context and classification operations afterwards. No default classification is assigned. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['assetCode', 'name', 'assetType'],
                additionalProperties: false,
                properties: {
                  assetCode: { type: 'string', maxLength: 100 },
                  name: { type: 'string', maxLength: 255 },
                  assetType: { type: 'string', maxLength: 100 },
                  ownerUserId: { type: 'string', format: 'uuid' },
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
          '201': {
            description:
              'IT asset created with null criticality, dataClassification and businessService',
          },
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
          'Requires an active Security Officer and reason (1–1000 trimmed characters). Rejects incoming dependencies from active assets. Atomically preserves relationships, saves archivedAt/archivedBy/archiveReason and appends an audit record. Detail returns those metadata fields; legacy archives have null actor/reason. Does not stop infrastructure or ingestion.',
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
                required: ['reason'],
                properties: { reason: { type: 'string', minLength: 1, maxLength: 1000 } },
              },
            },
          },
        },
        responses: {
          '204': { description: 'Asset archived and audit appended atomically' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Asset not found' },
          '409': {
            description:
              'Already archived, active dependent assets, or concurrent changes. Dependency message lists up to 20 asset codes/names.',
          },
          '422': { description: 'Missing or invalid archive reason' },
          '503': { description: 'Transaction timeout; retry' },
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
          'Returns asset identity, ownership, business service, dependencies, controls, event sources, risks, incidents and classification (null for initial/legacy values, otherwise confidentialityImpact, integrityImpact, availabilityImpact, businessImpact, rationale, methodVersion, assessedAt, assessedBy). Security Officers can view any asset; an Asset Owner can view only assets assigned to them.',
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
          'SECURAAI-ASSET-IMPACT-v1: max(C,I,A,Business), 1=low, 2-3=medium, 4=high, 5=critical. Internal method informed by FIPS PUB 199 (2004), Section 3, not a FIPS categorization. Saves latest scores, rationale, actor, time and method version; data sensitivity is independent. Requires an active Security Officer and active asset.',
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
                  'rationale',
                  'dataClassificationBasis',
                  'dataClassification',
                ],
                properties: {
                  confidentialityImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  integrityImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  availabilityImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  businessImpact: { type: 'integer', minimum: 1, maximum: 5 },
                  dataClassificationBasis: {
                    type: 'string',
                    minLength: 20,
                    maxLength: 2000,
                    description:
                      'Information sensitivity basis. Internal labels informed by ISO/IEC 27002:2022 control 5.12, not automatic access enforcement.',
                  },
                  rationale: {
                    type: 'string',
                    minLength: 20,
                    maxLength: 2000,
                    description:
                      'Basis covering the four impact criteria and asset business context; trimmed before validation.',
                  },
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
          'Updates the desired asset context atomically. Preserves retained links and their metadata, permits retaining existing inactive links, requires active records for new links, and rejects circular dependencies. Requires an active Security Officer.',
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
          '409': { description: 'Archived asset or concurrent context change; reload and retry' },
          '503': { description: 'Context transaction unavailable or expired; try again' },
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
      post: {
        tags: ['Incident Management'],
        summary: 'Create an incident manually or from a confirmed source',
        description:
          'Creates a V2 incident manually or from an eligible confirmed alert/security finding. Source-backed incidents retain a unique finding link; manual incidents have no finding link. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    type: 'object',
                    required: ['sourceType', 'sourceId', 'title', 'description', 'severity'],
                    properties: {
                      sourceType: { type: 'string', enum: ['alert', 'finding'] },
                      sourceId: { type: 'string', format: 'uuid' },
                      title: { type: 'string', minLength: 5, maxLength: 255 },
                      description: { type: 'string', minLength: 20, maxLength: 10000 },
                      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                      detectedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                  {
                    type: 'object',
                    required: ['sourceType', 'title', 'description', 'severity'],
                    properties: {
                      sourceType: { type: 'string', enum: ['manual'] },
                      title: { type: 'string', minLength: 5, maxLength: 255 },
                      description: { type: 'string', minLength: 20, maxLength: 10000 },
                      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                      detectedAt: { type: 'string', format: 'date-time' },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Incident created, with a source link when supplied' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Source alert or finding not found' },
          '409': {
            description: 'Source is unconfirmed, already converted, or changed concurrently',
          },
          '422': { description: 'Invalid incident details' },
        },
      },
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
    '/incidents/source-options': {
      get: {
        tags: ['Incident Management'],
        summary: 'List confirmed sources eligible for incident creation',
        description:
          'Returns confirmed alert findings that are not already linked to an incident. Requires an active Security Officer.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'search', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
        ],
        responses: {
          '200': { description: 'Paginated eligible source list' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/incidents/{incidentId}/containment-actions': {
      post: {
        tags: ['Incident Management'],
        summary: 'Record containment action',
        description:
          'Active Security Officers only. Appends a CONTAINMENT action and audit atomically using existing V2 incident_actions. Performer is the signed-in user. Does not change incident phase. Closed incidents reject writes. Times must not be in the future.',
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
                additionalProperties: false,
                required: ['description', 'performedAt'],
                properties: {
                  description: { type: 'string', minLength: 10, maxLength: 4000 },
                  performedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description:
              'Success envelope: id, phase=containment, description, performedAt, recordedAt, performedBy (id/name)',
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Active Security Officer required' },
          '404': { description: 'Incident not found' },
          '409': { description: 'Closed incident or concurrent update' },
          '422': { description: 'Invalid description or performed time' },
        },
      },
      get: {
        tags: ['Incident Management'],
        summary: 'View containment action history',
        description:
          'Active Security Officers and Executives. Includes closed incidents, newest performed time first, stable ID tie-break. data.items: id, phase=containment, description, performedAt, recordedAt, performedBy (id/name). data.pagination: page, limit, total, totalPages. Account names reflect current users.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        ],
        responses: {
          '200': { description: 'Success envelope with items and pagination' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Active viewer required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid ID or pagination' },
        },
      },
    },
    '/incidents/{incidentId}/eradication-actions': {
      post: {
        tags: ['Incident Management'],
        summary: 'Record eradication action',
        description:
          'Active Security Officers only. Appends a ERADICATION action and audit atomically using existing V2 incident_actions. Performer is the signed-in user. Does not change incident phase. Closed incidents reject writes. Times must not be in the future.',
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
                additionalProperties: false,
                required: ['description', 'performedAt'],
                properties: {
                  description: { type: 'string', minLength: 10, maxLength: 4000 },
                  performedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description:
              'Success envelope: id, phase=eradication, description, performedAt, recordedAt, performedBy (id/name)',
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Active Security Officer required' },
          '404': { description: 'Incident not found' },
          '409': { description: 'Closed incident or concurrent update' },
          '422': { description: 'Invalid description or performed time' },
        },
      },
      get: {
        tags: ['Incident Management'],
        summary: 'View eradication action history',
        description:
          'Active Security Officers and Executives. Includes closed incidents, newest performed time first, stable ID tie-break. data.items: id, phase=eradication, description, performedAt, recordedAt, performedBy (id/name). data.pagination: page, limit, total, totalPages. Account names reflect current users.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        ],
        responses: {
          '200': { description: 'Success envelope with items and pagination' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Active viewer required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid ID or pagination' },
        },
      },
    },
    '/incidents/{incidentId}/recovery-actions': {
      post: {
        tags: ['Incident Management'],
        summary: 'Record recovery action',
        description:
          'Active Security Officers only. Appends a RECOVERY action and audit atomically using existing V2 incident_actions. Performer is the signed-in user. Does not change incident phase. Closed incidents reject writes. Times must not be in the future.',
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
                additionalProperties: false,
                required: ['description', 'performedAt'],
                properties: {
                  description: { type: 'string', minLength: 10, maxLength: 4000 },
                  performedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description:
              'Success envelope: id, phase=recovery, description, performedAt, recordedAt, performedBy (id/name)',
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Active Security Officer required' },
          '404': { description: 'Incident not found' },
          '409': { description: 'Closed incident or concurrent update' },
          '422': { description: 'Invalid description or performed time' },
        },
      },
      get: {
        tags: ['Incident Management'],
        summary: 'View recovery action history',
        description:
          'Active Security Officers and Executives. Includes closed incidents, newest performed time first, stable ID tie-break. data.items: id, phase=recovery, description, performedAt, recordedAt, performedBy (id/name). data.pagination: page, limit, total, totalPages. Account names reflect current users.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        ],
        responses: {
          '200': { description: 'Success envelope with items and pagination' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Active viewer required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid ID or pagination' },
        },
      },
    },
    '/incidents/assignment-options': {
      get: {
        tags: ['Incident Management'],
        summary: 'List eligible incident handlers',
        description:
          'Active Security Officers only. Returns active Security Officers as users with id, name and email.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Success envelope with data.users' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer required' },
        },
      },
    },
    '/incidents/{incidentId}/assignee': {
      get: {
        tags: ['Incident Management'],
        summary: 'View incident assignment history',
        description:
          'Active Security Officers and Executives can read assignment audits, including closed incidents. Newest first. Handler names reflect current account names. data.items: id, assignedAt, assignedBy (id/name or null), previousHandler and handler (id/name or null), note. data.pagination: page, limit, total, totalPages.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        ],
        responses: {
          '200': { description: 'Success envelope with paginated assignment history' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer or Executive required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid identifier or pagination' },
        },
      },
      patch: {
        tags: ['Incident Management'],
        summary: 'Assign or change incident handler',
        description:
          'Active Security Officer assigns an active Security Officer. Updates handler and records previous/new handler, assigning officer, note and time atomically in audit_logs. Does not change response phase. Closed incidents cannot be assigned. Selecting the current handler is a no-op (changed=false).',
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
                additionalProperties: false,
                required: ['assigneeUserId', 'note'],
                properties: {
                  assigneeUserId: { type: 'string', format: 'uuid' },
                  note: { type: 'string', minLength: 10, maxLength: 2000 },
                  expectedUpdatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Success envelope containing incident, currentAssignment and changed',
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer required' },
          '404': { description: 'Incident not found' },
          '409': { description: 'Closed or stale incident, or handler no longer eligible' },
          '422': { description: 'Invalid UUID, note or timestamp' },
        },
      },
    },
    '/incidents/{incidentId}/severity': {
      get: {
        tags: ['Incident Management'],
        summary: 'View incident severity classification history',
        description:
          'Active Security Officers and Executives can read paginated audit-backed history, newest first. Includes previous/new severity, rationale, officer and time; closed incidents remain readable.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incidentId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        ],
        responses: {
          '200': {
            description:
              'Classification history with items (id, classifiedAt, classifiedBy, previousSeverity, severity, rationale) and pagination (page, limit, total, totalPages)',
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
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              classifiedAt: { type: 'string', format: 'date-time' },
                              classifiedBy: {
                                type: 'object',
                                nullable: true,
                                properties: {
                                  id: { type: 'string', format: 'uuid' },
                                  name: { type: 'string' },
                                },
                              },
                              previousSeverity: {
                                type: 'string',
                                nullable: true,
                                enum: ['low', 'medium', 'high', 'critical', null],
                              },
                              severity: {
                                type: 'string',
                                nullable: true,
                                enum: ['low', 'medium', 'high', 'critical', null],
                              },
                              rationale: { type: 'string', nullable: true },
                            },
                          },
                        },
                        pagination: {
                          type: 'object',
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
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer or Executive required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid identifier or pagination' },
        },
      },
      patch: {
        tags: ['Incident Management'],
        summary: 'Classify incident severity',
        description:
          'An active Security Officer records severity and a rationale supporting response priority. Writes severity and its audit record atomically. Closed incidents cannot be reclassified.',
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
                additionalProperties: false,
                required: ['severity', 'rationale'],
                properties: {
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  rationale: { type: 'string', minLength: 10, maxLength: 2000 },
                  expectedUpdatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Incident with updated severity and latest classification metadata',
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Active Security Officer required' },
          '404': { description: 'Incident not found' },
          '409': {
            description: 'Incident closed or changed concurrently; refresh before retrying',
          },
          '422': { description: 'Invalid incident identifier, severity or rationale' },
        },
      },
    },
    '/incidents/{incidentId}': {
      get: {
        tags: ['Incident Management'],
        summary: 'View security incident details',
        description:
          'Returns the incident description, severity, status, affected assets, assigned handler, response actions, and chronological handling history from the V2 database. Requires an active Security Officer or Executive.',
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
          '200': {
            description: 'Complete incident details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: {
                      type: 'object',
                      required: [
                        'id',
                        'incidentCode',
                        'title',
                        'severity',
                        'status',
                        'affectedAssets',
                        'responseActions',
                        'handlingHistory',
                      ],
                      properties: {
                        id: { type: 'string', format: 'uuid' },
                        incidentCode: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: ['string', 'null'] },
                        severity: { type: 'string' },
                        status: { type: 'string' },
                        affectedAssets: { type: 'array', items: { type: 'object' } },
                        responseActions: { type: 'array', items: { type: 'object' } },
                        handlingHistory: { type: 'array', items: { type: 'object' } },
                      },
                    },
                  },
                },
              },
            },
          },
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
    '/compliance/policies/{policyId}/versions/{versionId}/applicability': {
      get: {
        tags: ['Policies'],
        summary: 'Get applicability for an owned policy draft',
        description: 'Returns the saved scope plus active department and fixed-role options.',
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
          '200': { description: 'Policy applicability and available scope options' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role and ownership required' },
          '404': { description: 'Policy draft not found' },
        },
      },
      put: {
        tags: ['Policies'],
        summary: 'Define applicability for an owned policy draft',
        description:
          'Records departments, fixed roles, user-group labels, organizational scope, rationale and reference basis before review.',
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
                required: ['rationale', 'referenceBasis'],
                properties: {
                  departmentIds: {
                    type: 'array',
                    maxItems: 200,
                    uniqueItems: true,
                    items: { type: 'string', format: 'uuid' },
                  },
                  roleCodes: {
                    type: 'array',
                    uniqueItems: true,
                    items: {
                      type: 'string',
                      enum: ['ADMIN', 'SECURITY_OFFICER', 'EXECUTIVE', 'EMPLOYEE'],
                    },
                  },
                  userGroups: {
                    type: 'array',
                    maxItems: 200,
                    uniqueItems: true,
                    items: { type: 'string', maxLength: 100 },
                  },
                  organizationalScope: { type: ['string', 'null'], maxLength: 2000 },
                  rationale: { type: 'string', minLength: 20, maxLength: 2000 },
                  referenceBasis: { type: 'string', minLength: 5, maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Policy applicability saved' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role and ownership required' },
          '404': { description: 'Policy draft not found' },
          '409': { description: 'Policy version is no longer editable' },
          '422': {
            description: 'Invalid scope, inactive department, rationale or reference basis',
          },
        },
      },
    },
    '/compliance/policies/{policyId}/versions/{versionId}/submit': {
      post: {
        tags: ['Policies'],
        summary: 'Submit an owned policy draft for Admin review',
        description:
          'Moves an owned V2 policy version from DRAFT to IN_REVIEW after applicability has been defined. Requires an active Security Officer account. Concurrent or repeated submissions are rejected.',
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
    '/events': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'View centralized list of normalized security events',
        description:
          'Returns a paginated list of ingested security events with associated source, event family, account/user, asset/device, and mapping status.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          { name: 'eventSourceId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'eventFamily',
            in: 'query',
            schema: { type: 'string', enum: ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'] },
          },
          {
            name: 'mappingStatus',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['UNMAPPED', 'PARTIALLY_MAPPED', 'MAPPED', 'NEEDS_REVIEW'],
            },
          },
          { name: 'severity', in: 'query', schema: { type: 'string' } },
          { name: 'eventType', in: 'query', schema: { type: 'string' } },
          { name: 'account', in: 'query', schema: { type: 'string' } },
          { name: 'sourceIp', in: 'query', schema: { type: 'string' } },
          { name: 'assetId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'asset', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          {
            name: 'sortBy',
            in: 'query',
            schema: {
              type: 'string',
              enum: [
                'occurredAt',
                'ingestedAt',
                'eventType',
                'eventFamily',
                'severity',
                'mappingStatus',
              ],
              default: 'occurredAt',
            },
          },
          {
            name: 'sortOrder',
            in: 'query',
            schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
          },
        ],
        responses: {
          '200': { description: 'Paginated normalized security events' },
          '401': { description: 'Authentication required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/events/metrics': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'Get event ingestion overview metrics',
        description:
          'Returns total events count, mapped/unmapped counts, 24h count, and counts by event family.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Normalized security event metrics' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/events/mapping-options': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'Get entity mapping options for review and correction',
        description:
          'Returns available users, assets, and monitored accounts for event mapping correction.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Mapping options list' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/events/{id}': {
      get: {
        tags: ['Event Ingestion'],
        summary: 'Get normalized event details',
        description:
          'Returns full normalized event details including payload, source metadata, and entity mappings.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Normalized event detail' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Normalized security event not found' },
          '422': { description: 'Invalid event ID' },
        },
      },
    },
    '/events/{id}/mappings': {
      put: {
        tags: ['Event Ingestion'],
        summary: 'Review and correct event entity mappings',
        description:
          'Allows Security Officers to correct inaccurate system-generated mappings between security events and users, accounts, or assets.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  userId: { type: 'string', format: 'uuid', nullable: true },
                  assetId: { type: 'string', format: 'uuid', nullable: true },
                  monitoredAccountId: { type: 'string', format: 'uuid', nullable: true },
                  reason: { type: 'string', minLength: 1, maxLength: 500 },
                  confidence: { type: 'number', minimum: 0, maximum: 1, default: 1.0 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Updated entity mapping' },
          '401': { description: 'Authentication required' },
          '404': { description: 'Event, target user, or target asset not found' },
          '422': { description: 'Validation failed' },
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
          'Confirms an assigned alert under triage or further investigation as a true positive, atomically records the decision, creates a linked security finding, and marks the alert confirmed. Incident creation is a separate Incident Management workflow. Repeated calls by the assigned analyst return the existing finding.',
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
          '200': { description: 'Alert confirmed and linked security finding returned' },
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
    '/incidents/{incidentId}/risk-reassessment-requests': {
      get: {
        tags: ['Information Security Incident Management'],
        summary: 'View risk reassessment request history for an incident',
        description:
          'Returns newest-first request history with risk ownership, related control weakness, requester, reviewer, status and timestamps. Requires an active Security Officer.',
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
          '200': { description: 'Paginated reassessment request history' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident not found' },
          '422': { description: 'Invalid incident ID or pagination' },
        },
      },
      post: {
        tags: ['Information Security Incident Management'],
        summary: 'Create a risk reassessment request from an incident',
        security: [{ bearerAuth: [] }],
        responses: {
          '201': { description: 'Pending reassessment request created' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Incident not found' },
          '409': { description: 'An active request already exists' },
          '422': { description: 'Invalid input or relationship' },
        },
      },
    },
    '/risks/reassessment-requests/{requestId}/reject': {
      post: {
        tags: ['Risk Assessment'],
        summary: 'Reject a risk reassessment request',
        description:
          'Allows the assigned Risk Owner to close a pending or under-review request without changing the risk assessment or treatment plan. The decision rationale is retained for audit.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'requestId',
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
                  reason: { type: 'string', minLength: 20, maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Reassessment request rejected' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Assigned Risk Owner required' },
          '404': { description: 'Reassessment request not found' },
          '409': { description: 'Request is no longer pending or under review' },
          '422': { description: 'Invalid request ID or decision rationale' },
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
            name: 'departmentId',
            in: 'query',
            description: 'Return only users assigned to this department.',
            schema: { type: 'string', format: 'uuid' },
          },
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
    '/users/import': {
      post: {
        tags: ['Users'],
        summary: 'Import user accounts from Excel',
        description:
          'Active Admin only. Accepts one .xlsx file up to 5 MB and 1000 data rows. Valid rows are created and invalid rows are returned with row-level errors.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: { file: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Import totals and row-level errors' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' },
          '413': { description: 'File exceeds 5 MB' },
          '422': { description: 'Invalid file, workbook template or row limit' },
        },
      },
    },
    '/users/departments': {
      get: {
        tags: ['Users'],
        summary: 'List departments available to the user directory filter',
        description:
          'Active Admin only. Returns every active department, including departments that currently have no users.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Active departments ordered by name' },
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

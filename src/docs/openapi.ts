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
    '/compliance/control-assessments': {
      get: {
        tags: ['Policy & Compliance Control'],
        summary: 'List controls for effectiveness assessment',
        description:
          'Security Officers receive all controls; other active users receive controls assigned to them as Control Owner.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Controls with implementation, evidence, and assessment history' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/compliance/controls/{controlId}/assessments': {
      ...pendingV2Paths['/compliance/controls/{controlId}/assessments'],
      post: {
        tags: ['Policy & Compliance Control'],
        summary: 'Assess control effectiveness',
        description:
          'Records testing method, result, effectiveness, and notes. Requires active supporting evidence and Security Officer or assigned Control Owner access.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'controlId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '201': { description: 'Effectiveness assessment recorded' },
          '403': { description: 'Not Security Officer or assigned owner' },
          '404': { description: 'Control not found' },
          '422': { description: 'Active evidence required or invalid assessment' },
        },
      },
    },
    '/risks': {
      ...pendingV2Paths['/risks'],
      post: {
        tags: ['Risk Assessment'],
        summary: 'Create an initial risk assessment',
        description:
          'Creates a V2 risk, its asset scope, threats, vulnerabilities, and initial assessment atomically. Business service scope resolves to its active assets.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'title',
                  'description',
                  'ownerUserId',
                  'reviewDate',
                  'scope',
                  'threats',
                  'vulnerabilities',
                  'inherentLikelihood',
                  'inherentImpact',
                  'controlEffectiveness',
                  'residualLikelihood',
                  'residualImpact',
                  'targetRisk',
                  'assessmentReason',
                ],
              },
            },
          },
        },
        responses: {
          '201': { description: 'Risk assessment created' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '422': { description: 'Invalid assessment or scope' },
        },
      },
      get: {
        tags: ['Risk Assessment'],
        summary: 'View the risk register',
        description:
          'Returns a bounded, searchable page of V2 risks with their latest rating, related assets, owner, review date, and linked-record counts. Requires an active Security Officer account.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
          { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['open', 'under_treatment', 'accepted', 'closed', 'archived'],
            },
          },
          {
            name: 'riskRating',
            in: 'query',
            schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          },
          { name: 'ownerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'assetId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'reviewFrom', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'reviewTo', in: 'query', schema: { type: 'string', format: 'date' } },
          {
            name: 'sortBy',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['riskCode', 'title', 'reviewDate', 'updatedAt'],
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
          '200': { description: 'Paginated risk register' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '422': { description: 'Invalid query parameters' },
        },
      },
    },
    '/risks/create-options': {
      get: {
        tags: ['Risk Assessment'],
        summary: 'List options for creating a risk assessment',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        ],
        responses: {
          '200': { description: 'Active assets, business services, and risk owners' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
        },
      },
    },
    '/risks/{riskId}/threats': {
      post: {
        tags: ['Risk Assessment'],
        summary: 'Identify and link a threat',
        description:
          'Documents a threat for an existing risk and links it to one or more vulnerabilities belonging to that risk.',
        security: [{ bearerAuth: [] }],
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
              schema: { type: 'object', required: ['name', 'description', 'vulnerabilityIds'] },
            },
          },
        },
        responses: {
          '201': { description: 'Threat identified' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Risk not found' },
          '409': { description: 'Threat name already exists for the risk' },
          '422': { description: 'Invalid vulnerability links' },
        },
      },
    },
    '/risks/{riskId}/vulnerabilities': {
      post: {
        tags: ['Risk Assessment'],
        summary: 'Identify and link a vulnerability',
        description:
          'Documents a vulnerability for an existing risk and links it to security controls already associated with that risk.',
        security: [{ bearerAuth: [] }],
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
              schema: { type: 'object', required: ['name', 'description', 'controlIds'] },
            },
          },
        },
        responses: {
          '201': { description: 'Vulnerability identified' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Risk not found' },
          '409': { description: 'Vulnerability name already exists for the risk' },
          '422': { description: 'Invalid security control links' },
        },
      },
    },
    '/risks/{riskId}/inherent-assessments': {
      post: {
        tags: ['Risk Assessment'],
        summary: 'Assess inherent risk',
        description:
          'Records likelihood and potential impact before existing security-control effectiveness is considered. Requires asset, threat, and vulnerability context.',
        security: [{ bearerAuth: [] }],
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
              schema: { type: 'object', required: ['likelihood', 'impact', 'assessmentReason'] },
            },
          },
        },
        responses: {
          '201': { description: 'Inherent risk assessed' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Risk not found' },
          '422': { description: 'Incomplete risk context or invalid scores' },
        },
      },
    },
    '/risks/{riskId}/residual-assessments': {
      post: {
        tags: ['Risk Assessment'],
        summary: 'Assess residual risk',
        description:
          'Allows only the assigned Risk Owner to record remaining risk after all related controls have effectiveness assessments, and evaluates it against appetite and tolerance.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'riskId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '201': { description: 'Residual risk assessed' },
          '403': { description: 'Assigned Risk Owner required' },
          '404': { description: 'Risk not found' },
          '422': { description: 'Inherent or control assessments missing' },
        },
      },
    },
    '/risks/{riskId}/target-risk': {
      post: {
        tags: ['Risk Assessment'],
        summary: 'Define target risk',
        description:
          'Allows the assigned Risk Owner to set a target risk against a draft or active treatment plan after residual risk is assessed.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'riskId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '201': { description: 'Target risk defined' },
          '403': { description: 'Assigned Risk Owner required' },
          '404': { description: 'Risk not found' },
          '422': {
            description:
              'Residual assessment or treatment plan required, or target exceeds residual risk',
          },
        },
      },
    },
    '/risks/{riskId}/acceptance': {
      post: { tags: ['Risk Assessment'], summary: 'Review, reassess, and submit risk acceptance', description: 'Allows the assigned Risk Owner to record a fresh residual assessment, update the selected treatment plan, and submit acceptance for approval.', security: [{ bearerAuth: [] }], parameters: [{ name: 'riskId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '201': { description: 'Acceptance submitted' }, '403': { description: 'Assigned Risk Owner required' }, '404': { description: 'Risk not found' }, '409': { description: 'A pending acceptance already exists' }, '422': { description: 'Invalid treatment plan, reassessment, or validity date' } } },
    },
    '/risks/acceptances/{acceptanceId}/decision': {
      patch: { tags: ['Risk Assessment'], summary: 'Approve or reject risk acceptance', description: 'Allows an authorized Security Officer or Executive approver to decide a pending request. Requesters cannot approve their own request.', security: [{ bearerAuth: [] }], parameters: [{ name: 'acceptanceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Decision recorded' }, '403': { description: 'Authorized Approver required or self-approval attempted' }, '404': { description: 'Acceptance not found' }, '409': { description: 'Acceptance already decided' } } },
    },
    '/risks/treatment-plans/create-options': {
      get: {
        tags: ['Risk Assessment'],
        summary: 'List treatment-plan owners and security controls',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 100 } },
        ],
        responses: { '200': { description: 'Active users and available controls' }, '401': { description: 'Authentication required' } },
      },
    },
    '/risks/treatment-plans': {
      ...pendingV2Paths['/risks/treatment-plans'],
      post: {
        tags: ['Risk Assessment'],
        summary: 'Create a risk treatment plan',
        description: 'Allows a Security Officer or the assigned Risk Owner to create a draft plan with actions, owners, controls, due dates, and target risk.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['riskId', 'title', 'strategy', 'ownerUserId', 'targetDate', 'targetRisk', 'controlIds', 'actions'] } } } },
        responses: { '201': { description: 'Treatment plan created' }, '403': { description: 'Security Officer or assigned Risk Owner required' }, '404': { description: 'Risk not found' }, '422': { description: 'Invalid owners, controls, or due dates' } },
      },
    },
    '/risks/treatment-plans/{treatmentPlanId}': {
      ...pendingV2Paths['/risks/treatment-plans/{treatmentPlanId}'],
      patch: {
        tags: ['Risk Assessment'], summary: 'Update a risk treatment plan',
        description: 'Updates ownership, dates, lifecycle status, actions, and action progress for a Security Officer or assigned Risk Owner.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'treatmentPlanId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Treatment plan updated' }, '403': { description: 'Security Officer or assigned Risk Owner required' }, '404': { description: 'Treatment plan not found' }, '409': { description: 'Plan was concurrently updated' }, '422': { description: 'Invalid actions, owners, statuses, or dates' } },
      },
    },
    '/risks/{riskId}': {
      get: {
        tags: ['Risk Assessment'],
        summary: 'View a detailed risk record',
        description:
          'Returns a V2 risk with assessments, assets, controls, treatment plans, threats, vulnerabilities, owner, review date, and linked incidents.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'riskId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Detailed risk record' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Security Officer role required' },
          '404': { description: 'Risk not found' },
          '422': { description: 'Invalid risk ID' },
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
    '/auth/google': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate an existing V2 account with Google',
        description:
          'Verifies a Google ID token and creates a SecuraAI session only when its verified email belongs to an existing active account. Roles remain database-controlled.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['credential'],
                additionalProperties: false,
                properties: { credential: { type: 'string', minLength: 1, maxLength: 4096 } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Access and refresh token pair' },
          '401': { description: 'Invalid Google credential or unavailable account' },
          '422': { description: 'Invalid request body' },
          '429': { description: 'Too many attempts' },
          '503': { description: 'Google sign-in is not configured' },
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
    '/auth/password-reset/request': {
      post: {
        tags: ['Authentication'],
        summary: 'Request a password reset code',
        description:
          'Always returns the same response to avoid revealing whether an account exists.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                additionalProperties: false,
                properties: { email: { type: 'string', format: 'email', maxLength: 255 } },
              },
            },
          },
        },
        responses: {
          '202': { description: 'Request accepted regardless of account existence' },
          '422': { description: 'Invalid request body' },
          '429': { description: 'Too many attempts' },
          '503': { description: 'Email service is unavailable' },
        },
      },
    },
    '/auth/password-reset/confirm': {
      post: {
        tags: ['Authentication'],
        summary: 'Reset a password using a one-time code',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'newPassword', 'confirmPassword'],
                additionalProperties: false,
                properties: {
                  token: { type: 'string', pattern: '^\\d{6}$' },
                  newPassword: { type: 'string', minLength: 8, maxLength: 128 },
                  confirmPassword: { type: 'string', minLength: 8, maxLength: 128 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password reset and existing sessions revoked' },
          '400': { description: 'Reset code is invalid, expired or already used' },
          '422': { description: 'Invalid request body' },
          '429': { description: 'Too many attempts' },
        },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Change the authenticated user password',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword', 'confirmPassword'],
                additionalProperties: false,
                properties: {
                  currentPassword: { type: 'string', minLength: 1, maxLength: 128 },
                  newPassword: { type: 'string', minLength: 8, maxLength: 128 },
                  confirmPassword: { type: 'string', minLength: 8, maxLength: 128 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password changed while existing sessions remain active' },
          '400': { description: 'Current password is incorrect or password is unchanged' },
          '401': { description: 'Authentication required' },
          '409': { description: 'Password changed concurrently' },
          '422': { description: 'Invalid request body' },
          '429': { description: 'Too many attempts' },
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

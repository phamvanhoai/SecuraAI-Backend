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
    tags: [
      { name: 'Health' },
      { name: 'Authentication' },
      { name: 'Users' },
      { name: 'Role Management' },
      { name: 'Assets' },
      { name: 'Security Monitoring' },
      { name: 'AI Alerts' },
      { name: 'Policies' },
      { name: 'Integrations' },
    ],
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
        PublishPolicyVersionRequest: {
          type: 'object',
          additionalProperties: false,
          properties: {
            effectiveDate: { type: 'string', format: 'date', example: '2026-09-09' },
          },
        },
        PublishedPolicyVersion: {
          type: 'object',
          required: ['policyId', 'policyCode', 'title', 'status', 'publishedVersion'],
          properties: {
            policyId: { type: 'string', format: 'uuid' },
            policyCode: { type: 'string', example: 'ISP-001' },
            title: { type: 'string' },
            status: { type: 'string', enum: ['published'] },
            publishedVersion: {
              type: 'object',
              required: ['id', 'versionNumber', 'status', 'effectiveDate', 'publishedAt'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                versionNumber: { type: 'string', example: '1.0' },
                status: { type: 'string', enum: ['published'] },
                effectiveDate: { type: 'string', format: 'date', nullable: true },
                publishedByUserId: { type: 'string', format: 'uuid', nullable: true },
                publishedAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
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
        CustomRoleInput: {
          type: 'object',
          required: ['code', 'name'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', pattern: '^[A-Z][A-Z0-9_]*$', example: 'RISK_REVIEWER' },
            name: { type: 'string', minLength: 2, maxLength: 100 },
            description: { type: 'string', nullable: true, maxLength: 1000 },
            permissionIds: {
              type: 'array',
              maxItems: 200,
              uniqueItems: true,
              items: { type: 'string', format: 'uuid' },
            },
          },
        },
        CustomRole: {
          type: 'object',
          required: [
            'id',
            'code',
            'name',
            'isSystem',
            'permissions',
            'assignedUserCount',
            'workflowStepCount',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            isSystem: { type: 'boolean', enum: [false] },
            permissions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  code: { type: 'string' },
                  module: { type: 'string' },
                  action: { type: 'string' },
                  description: { type: 'string', nullable: true },
                },
              },
            },
            assignedUserCount: { type: 'integer' },
            workflowStepCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
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
            versionNumber: { type: 'string', minLength: 1, maxLength: 30, default: '1.0' },
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
        AssignAssetOwnerRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['ownerUserId', 'reason'],
          properties: {
            ownerUserId: { type: 'string', format: 'uuid', nullable: true },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
          },
        },
        AssetOwnerAssignment: {
          type: 'object',
          required: ['assetId', 'previousOwner', 'owner', 'changed', 'assignedAt'],
          properties: {
            assetId: { type: 'string', format: 'uuid' },
            previousOwner: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                fullName: { type: 'string' },
              },
            },
            owner: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string', format: 'uuid' },
                fullName: { type: 'string' },
              },
            },
            changed: { type: 'boolean' },
            assignedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        AssetImportJob: {
          type: 'object',
          required: [
            'id',
            'importType',
            'status',
            'totalRows',
            'successRows',
            'failedRows',
            'errors',
            'file',
            'createdAt',
            'completedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            importType: { type: 'string', enum: ['assets'] },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            totalRows: { type: 'integer', minimum: 0 },
            successRows: { type: 'integer', minimum: 0 },
            failedRows: { type: 'integer', minimum: 0 },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                required: ['row', 'code', 'message'],
                properties: {
                  row: { type: 'integer', minimum: 2 },
                  assetCode: { type: 'string' },
                  field: { type: 'string' },
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
            file: {
              type: 'object',
              required: ['id', 'originalName', 'mimeType', 'sizeBytes', 'checksum'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                originalName: { type: 'string' },
                mimeType: { type: 'string' },
                sizeBytes: { type: 'integer', nullable: true },
                checksum: { type: 'string', nullable: true },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        AssetHistoryItem: {
          type: 'object',
          required: ['id', 'action', 'changedBy', 'before', 'after', 'changedAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            action: {
              type: 'string',
              enum: [
                'created',
                'imported',
                'updated',
                'classified',
                'owner_assigned',
                'owner_reassigned',
                'owner_unassigned',
                'deleted',
              ],
            },
            changedBy: {
              type: 'object',
              nullable: true,
              required: ['id', 'fullName'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                fullName: { type: 'string' },
              },
            },
            before: { type: 'object', nullable: true, additionalProperties: true },
            after: { type: 'object', nullable: true, additionalProperties: true },
            changedAt: { type: 'string', format: 'date-time' },
          },
        },
        LogSourceConfiguration: {
          type: 'object',
          additionalProperties: false,
          required: ['format'],
          properties: {
            format: { type: 'string', enum: ['json', 'syslog', 'cef', 'text'] },
            timezone: { type: 'string', default: 'UTC', maxLength: 100 },
            collectRawPayload: { type: 'boolean', default: true },
            pollingIntervalSeconds: { type: 'integer', minimum: 1, maximum: 86400 },
            fieldMapping: {
              type: 'object',
              additionalProperties: false,
              properties: {
                timestamp: { type: 'string' },
                eventType: { type: 'string' },
                severity: { type: 'string' },
                sourceIp: { type: 'string' },
                destinationIp: { type: 'string' },
                externalEventId: { type: 'string' },
              },
            },
          },
        },
        DetectionRule: {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'name',
            'eventType',
            'threshold',
            'windowSeconds',
            'groupBy',
            'severity',
          ],
          properties: {
            id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]*$' },
            name: { type: 'string', maxLength: 150 },
            eventType: { type: 'string', maxLength: 100 },
            threshold: { type: 'integer', minimum: 1, maximum: 10000 },
            windowSeconds: { type: 'integer', minimum: 1, maximum: 86400 },
            groupBy: { type: 'string', enum: ['sourceIp', 'logSource'] },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            enabled: { type: 'boolean', default: true },
          },
        },
        CreateModelConfigurationRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['modelName', 'algorithm', 'version'],
          properties: {
            modelName: { type: 'string', maxLength: 150 },
            algorithm: { type: 'string', maxLength: 100 },
            version: { type: 'string', maxLength: 50 },
            provider: { type: 'string', default: 'ollama', maxLength: 150 },
            modelPath: { type: 'string', format: 'uri' },
            ollamaModel: { type: 'string', default: 'qwen3:4b', maxLength: 150 },
            rules: {
              type: 'array',
              maxItems: 100,
              items: { $ref: '#/components/schemas/DetectionRule' },
            },
          },
        },
        EvaluateAlertReliabilityRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['feedbackLabel'],
          properties: {
            feedbackLabel: {
              type: 'string',
              enum: ['confirmed_incident', 'false_positive', 'needs_review'],
            },
            comment: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
        ConfirmAlertIncidentRequest: {
          type: 'object',
          additionalProperties: false,
          properties: { comment: { type: 'string', minLength: 1, maxLength: 2000 } },
        },
        CreateLogSourceRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'sourceType', 'configuration'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 150 },
            sourceType: {
              type: 'string',
              enum: ['application', 'system', 'authentication', 'network', 'firewall', 'external'],
            },
            assetId: { type: 'string', format: 'uuid', nullable: true },
            integrationId: { type: 'string', format: 'uuid', nullable: true },
            configuration: { $ref: '#/components/schemas/LogSourceConfiguration' },
            status: { type: 'string', enum: ['active', 'inactive', 'error'], default: 'active' },
          },
        },
        UpdateLogSourceRequest: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 150 },
            assetId: { type: 'string', format: 'uuid', nullable: true },
            integrationId: { type: 'string', format: 'uuid', nullable: true },
            configuration: { $ref: '#/components/schemas/LogSourceConfiguration' },
            status: { type: 'string', enum: ['active', 'inactive', 'error'] },
          },
        },
        IngestSecurityEventsRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['events'],
          properties: {
            events: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              description:
                'JSON log objects. Canonical fields default to timestamp, eventType, severity, sourceIp, destinationIp and externalEventId; configured field mappings may override them.',
              items: { type: 'object', additionalProperties: true },
            },
          },
        },
        LogSource: {
          type: 'object',
          required: [
            'id',
            'name',
            'sourceType',
            'asset',
            'integration',
            'configuration',
            'status',
            'lastReceivedAt',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            sourceType: { type: 'string' },
            asset: { type: 'object', nullable: true },
            integration: { type: 'object', nullable: true },
            configuration: { $ref: '#/components/schemas/LogSourceConfiguration' },
            status: { type: 'string', enum: ['active', 'inactive', 'error'] },
            lastReceivedAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateIntegrationRequest: {
          type: 'object',
          required: ['name', 'integrationType'],
          properties: {
            name: { type: 'string' },
            integrationType: { type: 'string', enum: ['siem', 'firewall', 'log_source', 'api'] },
            baseUrl: { type: 'string', format: 'uri' },
            configuration: { type: 'object' },
          },
        },
        UpdateIntegrationRequest: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            baseUrl: { type: 'string', format: 'uri' },
            configuration: { type: 'object' },
            status: { type: 'string', enum: ['active', 'inactive', 'disabled'] },
          },
        },
        TestConnectionRequest: {
          type: 'object',
          properties: {
            timeoutMs: { type: 'integer', minimum: 1000, maximum: 10000, default: 5000 },
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
            connected: { type: 'boolean' },
            statusCode: { type: 'integer', nullable: true },
            latencyMs: { type: 'integer' },
            message: { type: 'string' },
          },
        },
        CreateSyncScheduleRequest: {
          type: 'object',
          required: ['scheduleExpression'],
          properties: {
            scheduleExpression: { type: 'string', example: '*/15 * * * *' },
            isActive: { type: 'boolean', default: true },
          },
        },
        UpdateSyncScheduleRequest: {
          type: 'object',
          properties: {
            scheduleExpression: { type: 'string', example: '0 * * * *' },
            isActive: { type: 'boolean' },
          },
        },
        SyncScheduleResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
            scheduleExpression: { type: 'string' },
            isActive: { type: 'boolean' },
            lastRunAt: { type: 'string', format: 'date-time', nullable: true },
            nextRunAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        TriggerSyncRequest: {
          type: 'object',
          properties: {
            syncScheduleId: { type: 'string', format: 'uuid' },
          },
        },
        SyncJobResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
            syncScheduleId: { type: 'string', format: 'uuid', nullable: true },
            status: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
            },
            recordsProcessed: { type: 'integer', example: 150 },
            recordsFailed: { type: 'integer', example: 0 },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            errorMessage: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        IntegrationLogResponse: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
            syncJobId: { type: 'string', format: 'uuid', nullable: true },
            level: { type: 'string', enum: ['info', 'warn', 'error'] },
            message: { type: 'string' },
            details: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/access-control/roles': {
        get: {
          tags: ['Role Management'],
          summary: 'View custom roles',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            {
              name: 'sortBy',
              in: 'query',
              schema: { type: 'string', enum: ['code', 'name', 'createdAt', 'updatedAt'] },
            },
            { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          ],
          responses: {
            '200': { description: 'Paginated custom roles' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing roles.read permission' },
          },
        },
        post: {
          tags: ['Role Management'],
          summary: 'Create custom role',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CustomRoleInput' } },
            },
          },
          responses: {
            '201': { description: 'Custom role created' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing roles.create permission' },
            '409': { description: 'Role code already exists' },
            '422': { description: 'Invalid input or permissions' },
          },
        },
      },
      '/access-control/roles/{roleId}': {
        parameters: [
          {
            name: 'roleId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        get: {
          tags: ['Role Management'],
          summary: 'View custom role details',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Custom role details' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing roles.read permission' },
            '404': { description: 'Custom role not found' },
          },
        },
        patch: {
          tags: ['Role Management'],
          summary: 'Update custom role',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  allOf: [{ $ref: '#/components/schemas/CustomRoleInput' }],
                  minProperties: 1,
                },
              },
            },
          },
          responses: {
            '200': { description: 'Custom role updated' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing roles.update permission' },
            '404': { description: 'Role not found' },
            '409': { description: 'Role code already exists' },
            '422': { description: 'System role or invalid input' },
          },
        },
        delete: {
          tags: ['Role Management'],
          summary: 'Delete custom role',
          security: [{ bearerAuth: [] }],
          responses: {
            '204': { description: 'Custom role deleted' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing roles.delete permission' },
            '404': { description: 'Role not found' },
            '409': { description: 'Role is in use' },
            '422': { description: 'System role cannot be deleted' },
          },
        },
      },
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
      '/assets/import-template': {
        get: {
          tags: ['Assets'],
          summary: 'Download the asset import Excel template',
          description:
            'Downloads the supported .xlsx template. Requires the assets.import permission.',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Excel template',
              content: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                  schema: { type: 'string', format: 'binary' },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.import permission is required' },
            '500': { description: 'Unexpected server error' },
          },
        },
      },
      '/assets/export': {
        get: {
          tags: ['Assets'],
          summary: 'Export the asset list to Excel',
          description:
            'Exports up to 10000 non-deleted assets using the same search, filter and sorting rules as the asset list. Requires the assets.export permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
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
              schema: { type: 'string', enum: ['active', 'inactive', 'retired', 'disposed'] },
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
              description: 'Asset Excel file, including a header-only file when no assets match',
              headers: {
                'X-Exported-Rows': {
                  description: 'Number of asset rows written to the workbook',
                  schema: { type: 'integer' },
                },
              },
              content: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
                  schema: { type: 'string', format: 'binary' },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.export permission is required' },
            '422': { description: 'Invalid filters or the 10000-row limit was exceeded' },
            '429': { description: 'Too many export requests' },
            '500': { description: 'Excel generation, audit or database failure' },
          },
        },
      },
      '/assets/import': {
        post: {
          tags: ['Assets'],
          summary: 'Import IT assets from Excel',
          description:
            'Creates valid assets from an .xlsx file and returns per-row errors without updating existing assets. Maximum 5 MB and 1000 non-empty rows. Requires the assets.import permission.',
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
            '200': {
              description: 'Import completed, including any row-level failures',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/AssetImportJob' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.import permission is required' },
            '413': { description: 'The file exceeds 5 MB' },
            '422': { description: 'Missing, invalid or unsupported workbook' },
            '429': { description: 'Too many import requests' },
            '500': { description: 'Import processing failed' },
          },
        },
      },
      '/assets/imports/{importJobId}': {
        get: {
          tags: ['Assets'],
          summary: 'Get an asset import result',
          description:
            'Returns counts and row-level errors. Requires the assets.import permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'importJobId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Import job result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/AssetImportJob' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.import permission is required' },
            '404': { description: 'Import job was not found' },
            '422': { description: 'Invalid import job ID' },
            '500': { description: 'Unexpected server error' },
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
      '/assets/{assetId}/owner': {
        put: {
          tags: ['Assets'],
          summary: 'Assign an asset owner',
          description:
            'Assigns, reassigns or unassigns an asset owner with a mandatory reason and atomic history/audit records. Requires the assets.assign-owner permission.',
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
                schema: { $ref: '#/components/schemas/AssignAssetOwnerRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Owner assignment result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/AssetOwnerAssignment' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.assign-owner permission is required' },
            '404': { description: 'Asset or owner was not found' },
            '409': { description: 'Asset owner changed concurrently' },
            '422': { description: 'Invalid input, inactive owner or disposed asset' },
            '429': { description: 'Too many requests' },
            '500': { description: 'Unexpected server error' },
          },
        },
      },
      '/assets/{assetId}/history': {
        get: {
          tags: ['Assets'],
          summary: 'View asset change history',
          description:
            'Returns a paginated timeline for an existing asset, including soft-deleted assets. Sensitive and unsupported JSON fields are removed. Requires the assets.history.read permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'assetId',
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
            {
              name: 'action',
              in: 'query',
              schema: {
                type: 'string',
                enum: [
                  'created',
                  'imported',
                  'updated',
                  'classified',
                  'owner_assigned',
                  'owner_reassigned',
                  'owner_unassigned',
                  'deleted',
                ],
              },
            },
            {
              name: 'changedByUserId',
              in: 'query',
              schema: { type: 'string', format: 'uuid' },
            },
            { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
            {
              name: 'sortOrder',
              in: 'query',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            },
          ],
          responses: {
            '200': {
              description: 'Paginated asset change history',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        required: ['asset', 'items', 'pagination'],
                        properties: {
                          asset: {
                            type: 'object',
                            required: ['id', 'assetCode', 'name', 'deleted'],
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              assetCode: { type: 'string' },
                              name: { type: 'string' },
                              deleted: { type: 'boolean' },
                            },
                          },
                          items: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/AssetHistoryItem' },
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
            '401': { description: 'Authentication required' },
            '403': { description: 'The assets.history.read permission is required' },
            '404': { description: 'Asset was not found' },
            '422': { description: 'Invalid asset ID, filter, pagination or date range' },
            '500': { description: 'Unexpected server error' },
          },
        },
      },
      '/compliance/policies': {
        post: {
          tags: ['Policies'],
          summary: 'Create an information security policy draft',
          description: 'Requires the policies.create permission.',
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
            '403': { description: 'The policies.create permission is required' },
            '409': { description: 'Policy code already exists' },
            '422': { description: 'Request validation failed' },
          },
        },
      },
      '/security-monitoring/log-sources': {
        get: {
          tags: ['Security Monitoring'],
          summary: 'List configured log sources',
          description: 'Requires the log-sources.read permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
            { name: 'sourceType', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'assetId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Paginated log source list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The log-sources.read permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
        post: {
          tags: ['Security Monitoring'],
          summary: 'Configure a log source',
          description:
            'Creates a non-secret parsing configuration. Integration credentials are managed separately. Requires log-sources.manage.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateLogSourceRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Log source created' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The log-sources.manage permission is required' },
            '404': { description: 'Related asset or integration was not found' },
            '422': { description: 'Invalid request body' },
          },
        },
      },
      '/ai-alerts/models': {
        get: {
          tags: ['AI Alerts'],
          summary: 'List pre-trained model configurations',
          description: 'Requires the ai-models.read permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'modelName', in: 'query', schema: { type: 'string', maxLength: 150 } },
            { name: 'active', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            '200': { description: 'Paginated model configuration list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-models.read permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
        post: {
          tags: ['AI Alerts'],
          summary: 'Configure a pre-trained model and detection rules',
          description:
            'Registers an immutable configuration version without training or fine-tuning. Requires ai-models.manage.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateModelConfigurationRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Model configuration created inactive' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-models.manage permission is required' },
            '409': { description: 'Model name and version already exist' },
            '422': { description: 'Invalid configuration' },
          },
        },
      },
      '/ai-alerts': {
        get: {
          tags: ['AI Alerts'],
          summary: 'View AI alerts',
          description:
            'Returns generated alert summaries. Use detectedAfter and the returned serverTime watermark for near-real-time polling. Requires ai-alerts.read.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'assetId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'logSourceId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'detectedAfter', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': { description: 'Paginated AI alert list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-alerts.read permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
      },
      '/ai-alerts/models/{modelVersionId}/activate': {
        post: {
          tags: ['AI Alerts'],
          summary: 'Activate a model configuration version',
          description: 'Atomically deactivates the previous version with the same model name.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'modelVersionId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Model configuration activated' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-models.manage permission is required' },
            '404': { description: 'Model version was not found' },
            '422': { description: 'Invalid model version ID' },
          },
        },
      },
      '/ai-alerts/{alertId}/feedback': {
        post: {
          tags: ['AI Alerts'],
          summary: 'Evaluate AI alert reliability',
          description:
            'Records an analyst assessment without changing the alert lifecycle status. Requires ai-alerts.feedback.',
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
                schema: { $ref: '#/components/schemas/EvaluateAlertReliabilityRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Reliability feedback recorded' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-alerts.feedback permission is required' },
            '404': { description: 'AI alert was not found' },
            '422': { description: 'Invalid alert ID or feedback' },
          },
        },
      },
      '/ai-alerts/{alertId}/confirm-incident': {
        post: {
          tags: ['AI Alerts'],
          summary: 'Confirm an AI alert as a real incident',
          description:
            'Moves a new or reviewing alert to confirmed and records analyst feedback atomically. This does not create an incident draft. Requires ai-alerts.confirm.',
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
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConfirmAlertIncidentRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Alert confirmed or already confirmed' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-alerts.confirm permission is required' },
            '404': { description: 'AI alert was not found' },
            '409': { description: 'Current alert status cannot transition to confirmed' },
            '422': { description: 'Invalid alert ID or request body' },
          },
        },
      },
      '/compliance/policies/{policyId}/versions/{versionId}/publish': {
        post: {
          tags: ['Policies'],
          summary: 'Publish an official policy version',
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
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PublishPolicyVersionRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Official policy version published',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/PublishedPolicyVersion' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.publish permission is required' },
            '404': { description: 'Policy version was not found' },
            '409': { description: 'Policy version cannot be published in its current state' },
            '422': { description: 'Invalid IDs or request body' },
          },
        },
      },
      '/security-monitoring/log-sources/{logSourceId}': {
        patch: {
          tags: ['Security Monitoring'],
          summary: 'Update a log source configuration',
          description: 'Requires the log-sources.manage permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'logSourceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateLogSourceRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Log source updated' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The log-sources.manage permission is required' },
            '404': { description: 'Log source, asset or integration was not found' },
            '422': { description: 'Invalid request body or log source ID' },
          },
        },
      },
      '/integrations': {
        post: {
          tags: ['Integrations'],
          summary: 'Create external integration configuration',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateIntegrationRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Integration created' },
            '400': { description: 'Validation or SSRF error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
          },
        },
        get: {
          tags: ['Integrations'],
          summary: 'List external integrations',
          security: [{ bearerAuth: [] }],
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
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'Integration details' },
            '404': { description: 'Integration not found' },
          },
        },
        patch: {
          tags: ['Integrations'],
          summary: 'Update integration configuration',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateIntegrationRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Integration updated' },
            '404': { description: 'Integration not found' },
          },
        },
      },
      '/integrations/{id}/test-connection': {
        post: {
          tags: ['Integrations'],
          summary: 'Test external connection to SIEM or Firewall',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TestConnectionRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Connection test outcome' },
            '400': { description: 'SSRF rejected or no base URL configured' },
            '404': { description: 'Integration not found' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/security-monitoring/log-sources/{logSourceId}/events': {
        post: {
          tags: ['Security Monitoring'],
          summary: 'Ingest and normalize security events',
          description:
            'Accepts up to 100 JSON events for an active log source, applies its field mapping, ignores duplicate external event IDs and updates lastReceivedAt. Requires security-events.ingest.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'logSourceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/IngestSecurityEventsRequest' },
              },
            },
          },
          responses: {
            '202': { description: 'Events validated, normalized and persisted' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The security-events.ingest permission is required' },
            '404': { description: 'Log source was not found' },
            '409': {
              description: 'Log source is inactive, invalid or not configured for JSON ingestion',
            },
            '422': { description: 'Invalid request body or event data' },
            '429': { description: 'Too many ingestion requests' },
          },
        },
      },
      '/integrations/{id}/schedules': {
        post: {
          tags: ['Integrations'],
          summary: 'Create synchronization schedule',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateSyncScheduleRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Sync schedule created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/SyncScheduleResponse' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid cron expression format' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
        get: {
          tags: ['Integrations'],
          summary: 'List synchronization schedules for integration',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            '200': { description: 'List of sync schedules' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
      },
      '/integrations/{id}/schedules/{scheduleId}': {
        get: {
          tags: ['Integrations'],
          summary: 'Get sync schedule details',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'scheduleId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Sync schedule details' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Schedule not found' },
          },
        },
        patch: {
          tags: ['Integrations'],
          summary: 'Update sync schedule',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'scheduleId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateSyncScheduleRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Sync schedule updated' },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Schedule not found' },
          },
        },
        delete: {
          tags: ['Integrations'],
          summary: 'Delete sync schedule',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'scheduleId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '204': { description: 'Sync schedule deleted' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Schedule not found' },
          },
        },
      },
      '/integrations/{id}/sync': {
        post: {
          tags: ['Integrations'],
          summary: 'Trigger synchronization job on integration',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TriggerSyncRequest' } },
            },
          },
          responses: {
            '200': {
              description: 'Synchronization job result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: { $ref: '#/components/schemas/SyncJobResponse' },
                    },
                  },
                },
              },
            },
            '400': { description: 'No base URL configured or validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
            '409': { description: 'Concurrent synchronization already in progress' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/integrations/{id}/sync-jobs': {
        get: {
          tags: ['Integrations'],
          summary: 'List synchronization job history',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
              },
            },
            { name: 'syncScheduleId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            {
              name: 'sortBy',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['createdAt', 'startedAt', 'completedAt', 'status'],
              },
            },
            { name: 'sortOrder', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          ],
          responses: {
            '200': { description: 'List of sync jobs' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
      },
      '/integrations/{id}/sync-jobs/{jobId}': {
        get: {
          tags: ['Integrations'],
          summary: 'Get synchronization job details',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'jobId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Sync job details' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Job not found' },
          },
        },
      },
      '/integrations/{id}/logs': {
        get: {
          tags: ['Integrations'],
          summary: 'List integration logs and error events',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            {
              name: 'level',
              in: 'query',
              schema: { type: 'string', enum: ['info', 'warn', 'error'] },
            },
            { name: 'syncJobId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          ],
          responses: {
            '200': { description: 'List of integration logs' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
      },
    },
  },
  apis: [],
});

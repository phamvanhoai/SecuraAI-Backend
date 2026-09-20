import swaggerJsdoc from 'swagger-jsdoc';
import { loginHistoryPaths } from './login-history.openapi.js';
import { departmentTrainingReportPaths } from './department-training-report.openapi.js';
import { env } from '../config/env.js';
import { trainingReminderPaths } from './training-reminders.openapi.js';
import { complianceReminderPaths } from './compliance-reminders.openapi.js';
import { incidentPaths } from './incidents.openapi.js';
import { accountLockPaths } from './account-lock.openapi.js';

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
      { name: 'Risk Assessments' },
      { name: 'Security Monitoring' },
      { name: 'AI Alerts' },
      { name: 'Policies' },
      { name: 'Incidents' },
      { name: 'Integrations' },
      { name: 'Training Awareness' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        reminderCronAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Server-only CRON_SECRET; not a user JWT',
        },
      },
      schemas: {
        CreateTrainingCourseRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'content'],
          properties: {
            lessons: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              description:
                'Ordered lessons; structured courses must be created as drafts. Maximum 100 materials and 100 questions across the course. Optional only for legacy clients.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'isRequired', 'materials'],
                properties: {
                  title: { type: 'string', minLength: 3, maxLength: 255 },
                  description: { type: 'string', maxLength: 2000 },
                  isRequired: { type: 'boolean' },
                  materials: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 10,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['title', 'type'],
                      properties: {
                        title: { type: 'string', minLength: 1, maxLength: 255 },
                        type: { type: 'string', enum: ['text', 'video', 'document', 'link'] },
                        content: { type: 'string', maxLength: 50000 },
                        externalUrl: {
                          type: 'string',
                          format: 'uri',
                          maxLength: 2000,
                          description:
                            'HTTPS without credentials; backend stores but does not fetch the URL.',
                        },
                        uploadKey: {
                          type: 'string',
                          format: 'uuid',
                          description:
                            'Unique multipart file field name; at most 10 uploads. Exactly one source matching type.',
                        },
                      },
                    },
                  },
                  assessment: {
                    $ref: '#/components/schemas/CreateTrainingCourseRequest/properties/assessment',
                  },
                },
              },
            },
            title: { type: 'string', minLength: 3, maxLength: 255 },
            description: { type: 'string', nullable: true, maxLength: 2000 },
            content: { type: 'string', minLength: 10, maxLength: 50000 },
            status: {
              type: 'string',
              enum: ['draft', 'published'],
              default: 'draft',
              description: 'Published courses require an assessment.',
            },
            assessment: {
              type: 'object',
              description:
                'Optional post-training multiple-choice assessment created atomically with the course.',
              required: ['title', 'passingScore', 'maxAttempts', 'questions'],
              properties: {
                title: { type: 'string', minLength: 3, maxLength: 255 },
                passingScore: { type: 'number', minimum: 0, maximum: 100 },
                maxAttempts: { type: 'integer', minimum: 1, maximum: 10 },
                questions: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 50,
                  items: {
                    type: 'object',
                    required: ['type', 'text', 'options'],
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['single_choice', 'multiple_choice'],
                        description:
                          'Single choice requires exactly one correct option; multiple choice requires at least two.',
                      },
                      text: { type: 'string', minLength: 3, maxLength: 2000 },
                      options: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 6,
                        description:
                          'Correct-option count is validated according to the question type.',
                        items: {
                          type: 'object',
                          required: ['text', 'isCorrect'],
                          properties: {
                            text: { type: 'string', minLength: 1, maxLength: 1000 },
                            isCorrect: { type: 'boolean' },
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
        TrainingCourse: {
          type: 'object',
          required: ['id', 'title', 'status', 'createdAt', 'updatedAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            content: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'published', 'archived'] },
            createdByUserId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        AssignTrainingCourseRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'startDate', 'dueDate', 'userIds', 'departmentIds'],
          properties: {
            changeReason: {
              type: 'string',
              minLength: 3,
              maxLength: 500,
              description: 'Required when updating an existing campaign.',
            },
            title: { type: 'string', minLength: 3, maxLength: 255 },
            startDate: { type: 'string', format: 'date' },
            dueDate: { type: 'string', format: 'date' },
            userIds: { type: 'array', maxItems: 200, items: { type: 'string', format: 'uuid' } },
            departmentIds: {
              type: 'array',
              maxItems: 200,
              items: { type: 'string', format: 'uuid' },
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password', minLength: 8 },
          },
        },
        InitializeUserAccountRequest: {
          type: 'object',
          required: ['email', 'fullName', 'roleCodes'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email' },
            fullName: { type: 'string', minLength: 2, maxLength: 150 },
            phone: { type: 'string', maxLength: 30 },
            employeeCode: { type: 'string', maxLength: 50 },
            departmentId: { type: 'string', format: 'uuid' },
            roleCodes: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        },
        RequestPasswordReset: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', format: 'email' } },
        },
        ConfirmPasswordReset: {
          type: 'object',
          required: ['token', 'newPassword', 'confirmPassword'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
            newPassword: {
              type: 'string',
              format: 'password',
              minLength: 8,
              maxLength: 128,
              description:
                'At least 8 characters, one uppercase letter, and one special character.',
            },
            confirmPassword: {
              type: 'string',
              format: 'password',
              minLength: 8,
              maxLength: 128,
              description: 'Must match newPassword.',
            },
          },
        },
        ChangePasswordRequest: {
          type: 'object',
          required: ['currentPassword', 'newPassword', 'confirmPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', format: 'password', minLength: 1 },
            newPassword: {
              type: 'string',
              format: 'password',
              minLength: 8,
              maxLength: 128,
              description:
                'At least 8 characters, one uppercase letter, and one special character.',
            },
            confirmPassword: { type: 'string', format: 'password', minLength: 8, maxLength: 128 },
          },
        },
        SetupMfaRequest: {
          type: 'object',
          required: ['currentPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', format: 'password', minLength: 1 },
          },
        },
        VerifyMfaRequest: {
          type: 'object',
          required: ['code'],
          additionalProperties: false,
          properties: {
            code: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
          },
        },
        VerifyMfaChallengeRequest: {
          type: 'object',
          required: ['challengeToken', 'code'],
          additionalProperties: false,
          properties: {
            challengeToken: { type: 'string', minLength: 32, maxLength: 256 },
            code: {
              type: 'string',
              pattern: '^(?:\\d{6}|[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){2})$',
              description: 'A current authenticator code or one unused recovery code.',
            },
          },
        },
        DisableMfaRequest: {
          type: 'object',
          required: ['currentPassword', 'code'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', format: 'password' },
            code: { type: 'string', pattern: '^\\d{6}$' },
          },
        },
        CreateMfaRecoveryRequest: {
          type: 'object',
          required: ['challengeToken'],
          additionalProperties: false,
          properties: { challengeToken: { type: 'string', minLength: 32, maxLength: 256 } },
        },
        DecideMfaRecoveryRequest: {
          type: 'object',
          required: ['reason'],
          additionalProperties: false,
          properties: { reason: { type: 'string', minLength: 10, maxLength: 2000 } },
        },
        MfaChallenge: {
          type: 'object',
          required: ['mfaRequired', 'challengeToken', 'expiresIn'],
          properties: {
            mfaRequired: { type: 'boolean', enum: [true] },
            challengeToken: { type: 'string' },
            expiresIn: { type: 'integer', example: 300, description: 'Lifetime in seconds' },
          },
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
        UpdatePolicyCreateVersionRequest: {
          type: 'object',
          required: ['versionNumber', 'content', 'changeSummary'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 255 },
            description: { type: 'string', maxLength: 2000, nullable: true },
            versionNumber: {
              type: 'string',
              minLength: 1,
              maxLength: 30,
              example: '1.1',
            },
            content: { type: 'string', minLength: 1, maxLength: 500000 },
            changeSummary: { type: 'string', minLength: 1, maxLength: 5000 },
          },
        },
        NewPolicyVersion: {
          type: 'object',
          required: ['policyId', 'policyCode', 'title', 'policyStatus', 'version', 'updatedAt'],
          properties: {
            policyId: { type: 'string', format: 'uuid' },
            policyCode: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            ownerUserId: { type: 'string', format: 'uuid', nullable: true },
            policyStatus: { type: 'string', enum: ['draft'] },
            version: {
              type: 'object',
              required: ['id', 'versionNumber', 'content', 'changeSummary', 'status', 'createdAt'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                versionNumber: { type: 'string' },
                content: { type: 'string' },
                changeSummary: { type: 'string', nullable: true },
                status: { type: 'string', enum: ['draft'] },
                createdByUserId: { type: 'string', format: 'uuid', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        PublishablePolicy: {
          type: 'object',
          required: ['id', 'policyCode', 'title', 'status', 'draftVersion', 'updatedAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            policyCode: { type: 'string', example: 'ISP-001' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            ownerUserId: { type: 'string', format: 'uuid', nullable: true },
            status: { type: 'string', enum: ['draft'] },
            draftVersion: {
              type: 'object',
              required: ['id', 'versionNumber', 'status', 'createdAt'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                versionNumber: { type: 'string' },
                status: { type: 'string', enum: ['draft'] },
                createdByUserId: { type: 'string', format: 'uuid', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        DraftPolicyVersionDetail: {
          type: 'object',
          required: ['policyId', 'policyCode', 'title', 'policyStatus', 'version', 'updatedAt'],
          properties: {
            policyId: { type: 'string', format: 'uuid' },
            policyCode: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            ownerUserId: { type: 'string', format: 'uuid', nullable: true },
            policyStatus: { type: 'string', enum: ['draft'] },
            updatedAt: { type: 'string', format: 'date-time' },
            version: {
              type: 'object',
              required: ['id', 'versionNumber', 'content', 'status', 'createdAt'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                versionNumber: { type: 'string' },
                content: { type: 'string' },
                changeSummary: { type: 'string', nullable: true },
                status: { type: 'string', enum: ['draft'] },
                effectiveDate: { type: 'string', format: 'date', nullable: true },
                createdByUserId: { type: 'string', format: 'uuid', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
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
        CreateApiKeyRequest: {
          type: 'object',
          required: ['keyName'],
          additionalProperties: false,
          properties: {
            keyName: { type: 'string', minLength: 1, maxLength: 100 },
            secret: { type: 'string', minLength: 1, maxLength: 1000 },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            isActive: { type: 'boolean', default: true },
          },
        },
        UpdateApiKeyRequest: {
          type: 'object',
          additionalProperties: false,
          properties: {
            keyName: { type: 'string', minLength: 1, maxLength: 100 },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            isActive: { type: 'boolean' },
          },
        },
        RotateApiKeyRequest: {
          type: 'object',
          additionalProperties: false,
          properties: {
            secret: { type: 'string', minLength: 1, maxLength: 1000 },
          },
        },
        ApiKeyResponse: {
          type: 'object',
          required: ['id', 'integrationId', 'keyName', 'isActive', 'status', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
            keyName: { type: 'string' },
            keyFingerprint: { type: 'string', nullable: true },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              description: 'Must be in the future (expiresAt > currentTime)',
            },
            isActive: { type: 'boolean' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'EXPIRED', 'REVOKED'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiKeyCreatedResponse: {
          type: 'object',
          required: ['id', 'integrationId', 'keyName', 'isActive', 'status', 'createdAt', 'secret'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            integrationId: { type: 'string', format: 'uuid' },
            keyName: { type: 'string' },
            keyFingerprint: { type: 'string', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            isActive: { type: 'boolean' },
            status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'EXPIRED'] },
            createdAt: { type: 'string', format: 'date-time' },
            secret: {
              type: 'string',
              description: 'Plaintext secret shown only once upon creation or rotation',
            },
          },
        },
        ConnectionStatusSummaryResponse: {
          type: 'object',
          required: [
            'totalIntegrations',
            'activeCount',
            'errorCount',
            'inactiveCount',
            'pendingCount',
            'timeWindow',
            'checks24h',
            'successfulChecks24h',
            'failedChecks24h',
            'availability24h',
            'averageLatency24h',
            'failingIntegrations',
            'recentLogs',
          ],
          properties: {
            totalIntegrations: { type: 'integer' },
            activeCount: { type: 'integer' },
            errorCount: { type: 'integer' },
            inactiveCount: { type: 'integer' },
            pendingCount: { type: 'integer' },
            timeWindow: { type: 'string', example: '24h' },
            checks24h: { type: 'integer' },
            successfulChecks24h: { type: 'integer' },
            failedChecks24h: { type: 'integer' },
            availability24h: { type: 'number', nullable: true, example: 98.5 },
            averageLatency24h: { type: 'number', nullable: true, example: 120 },
            failingIntegrations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  integrationType: { type: 'string' },
                  baseUrl: { type: 'string', nullable: true },
                  status: { type: 'string' },
                  lastConnectedAt: { type: 'string', format: 'date-time', nullable: true },
                  lastErrorMessage: { type: 'string', nullable: true },
                  lastCheckedAt: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
            recentLogs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  integrationId: { type: 'string', format: 'uuid' },
                  integrationName: { type: 'string' },
                  level: { type: 'string' },
                  message: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  latencyMs: { type: 'integer', nullable: true },
                  httpStatus: { type: 'integer', nullable: true },
                  success: { type: 'boolean', nullable: true },
                  errorCode: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        BatchConnectionCheckRequest: {
          type: 'object',
          additionalProperties: false,
          properties: {
            integrationIds: {
              type: 'array',
              items: { type: 'string', format: 'uuid' },
              description:
                'Optional list of specific integration IDs to probe. If omitted, all configured active integrations are probed.',
            },
            timeoutMs: {
              type: 'integer',
              minimum: 1000,
              maximum: 10000,
              default: 5000,
              description: 'Connection timeout in milliseconds (1000ms - 10000ms).',
            },
          },
        },
        BatchConnectionCheckResponse: {
          type: 'object',
          required: ['totalTested', 'successful', 'failed', 'results'],
          properties: {
            totalTested: { type: 'integer' },
            successful: { type: 'integer' },
            failed: { type: 'integer' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  integrationId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  connected: { type: 'boolean' },
                  statusCode: { type: 'integer', nullable: true },
                  latencyMs: { type: 'integer' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        IntegrationConnectionStatusResponse: {
          type: 'object',
          required: [
            'id',
            'name',
            'integrationType',
            'status',
            'lastConnectedAt',
            'timeWindow',
            'checks24h',
            'successfulChecks24h',
            'failedChecks24h',
            'availability24h',
            'averageLatency24h',
            'recentLogs',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            integrationType: { type: 'string' },
            baseUrl: { type: 'string', nullable: true },
            status: { type: 'string' },
            lastConnectedAt: { type: 'string', format: 'date-time', nullable: true },
            timeWindow: { type: 'string', example: '24h' },
            checks24h: { type: 'integer' },
            successfulChecks24h: { type: 'integer' },
            failedChecks24h: { type: 'integer' },
            availability24h: { type: 'number', nullable: true, example: 100.0 },
            averageLatency24h: { type: 'number', nullable: true, example: 45 },
            recentLogs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  integrationId: { type: 'string', format: 'uuid' },
                  level: { type: 'string' },
                  message: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  latencyMs: { type: 'integer', nullable: true },
                  httpStatus: { type: 'integer', nullable: true },
                  success: { type: 'boolean', nullable: true },
                  errorCode: { type: 'string', nullable: true },
                },
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
        UserDetail: {
          type: 'object',
          required: [
            'id',
            'email',
            'fullName',
            'status',
            'mustChangePassword',
            'mfaEnabled',
            'roles',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            fullName: { type: 'string' },
            phone: { type: 'string', nullable: true },
            employeeCode: { type: 'string', nullable: true },
            avatarUrl: { type: 'string', nullable: true },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'locked', 'disabled'],
            },
            mustChangePassword: { type: 'boolean' },
            emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
            lastLockedAt: { type: 'string', format: 'date-time', nullable: true },
            disabledAt: { type: 'string', format: 'date-time', nullable: true },
            mfaEnabled: { type: 'boolean' },
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
            roles: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'code', 'name', 'assignedAt'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  code: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  assignedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CurrentUser: {
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
            status: { type: 'string' },
            mustChangePassword: { type: 'boolean' },
            mfaEnabled: { type: 'boolean' },
            roles: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'name'],
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
            permissions: { type: 'array', items: { type: 'string' }, uniqueItems: true },
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
            isSystem: { type: 'boolean' },
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
        Permission: {
          type: 'object',
          required: ['id', 'code', 'module', 'action', 'description'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string' },
            module: { type: 'string' },
            action: { type: 'string' },
            description: { type: 'string', nullable: true },
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
        UpdatePolicyDraftRequest: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            title: { type: 'string', minLength: 3, maxLength: 255 },
            description: { type: 'string', nullable: true, maxLength: 2000 },
            versionNumber: { type: 'string', minLength: 1, maxLength: 30 },
            content: { type: 'string', minLength: 1, maxLength: 500000 },
            changeSummary: { type: 'string', nullable: true, maxLength: 5000 },
          },
        },
        AssignPolicyDepartmentsRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['departmentIds'],
          properties: {
            departmentIds: {
              type: 'array',
              maxItems: 200,
              uniqueItems: true,
              items: { type: 'string', format: 'uuid' },
            },
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
            'summary',
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
            summary: {
              type: 'object',
              required: ['totalRows', 'importedRows', 'duplicateRows', 'invalidRows', 'message'],
              properties: {
                totalRows: { type: 'integer', minimum: 0 },
                importedRows: { type: 'integer', minimum: 0 },
                duplicateRows: { type: 'integer', minimum: 0 },
                invalidRows: { type: 'integer', minimum: 0 },
                message: { type: 'string' },
              },
            },
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
        AlertThreshold: {
          type: 'object',
          required: ['id', 'asset', 'threshold', 'riskLevelMin', 'enabled', 'updatedAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            asset: {
              type: 'object',
              required: ['id', 'assetCode', 'name'],
              properties: {
                id: { type: 'string', format: 'uuid' },
                assetCode: { type: 'string' },
                name: { type: 'string' },
              },
            },
            threshold: { type: 'number', minimum: 0.01, maximum: 1 },
            riskLevelMin: {
              type: 'string',
              nullable: true,
              enum: ['low', 'medium', 'high', 'critical'],
            },
            enabled: { type: 'boolean' },
            updatedByUserId: { type: 'string', format: 'uuid', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        SetAlertThresholdRequest: {
          type: 'object',
          additionalProperties: false,
          required: ['threshold'],
          properties: {
            threshold: { type: 'number', minimum: 0.01, maximum: 1 },
            riskLevelMin: {
              type: 'string',
              nullable: true,
              enum: ['low', 'medium', 'high', 'critical'],
            },
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
        AlertFeedback: {
          type: 'object',
          required: ['id', 'alertId', 'feedbackLabel', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            alertId: { type: 'string', format: 'uuid' },
            reviewedByUserId: { type: 'string', format: 'uuid', nullable: true },
            feedbackLabel: {
              type: 'string',
              enum: ['confirmed_incident', 'false_positive', 'needs_review'],
            },
            comment: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
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
      ...loginHistoryPaths,
      ...trainingReminderPaths,
      ...departmentTrainingReportPaths,
      ...complianceReminderPaths,
      ...incidentPaths,
      ...accountLockPaths,
      '/training/enrollments/{enrollmentId}/withdraw': {
        post: {
          tags: ['Training Awareness'],
          summary: 'Withdraw an individual training assignment',
          description:
            'Requires training-courses.assign. Preserves history and quiz results, blocks further assessment access, and audits the reason and actor. Completed and withdrawn enrollments cannot be withdrawn.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'enrollmentId',
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
                  properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Assignment withdrawn' },
            '403': { description: 'Insufficient permissions' },
            '409': { description: 'Enrollment completed, withdrawn, or unavailable' },
            '422': { description: 'Invalid reason or identifier' },
          },
        },
      },
      '/training/my-certificates': {
        get: {
          tags: ['Training Awareness'],
          summary: 'List my issued training certificates (UC165)',
          description:
            'Requires training-certificates.read-own. Returns only certificates belonging to the signed-in user; certificate metadata only, not a generated PDF.',
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
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          ],
          responses: {
            '200': {
              description:
                'Paginated certificates with id, number, issuedAt, issuedBy, enrollmentId, completedAt, campaignTitle and courseTitle',
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'Insufficient permissions' },
            '422': { description: 'Invalid query' },
          },
        },
      },
      '/training/enrollments/{enrollmentId}/certificate': {
        get: {
          tags: ['Training Awareness'],
          summary: 'View training completion certificate and eligibility',
          description:
            'Requires training-completion.read. Returns enrollmentId, learnerName, courseTitle, campaignTitle, completedAt, eligible and nullable certificate { id, number, issuedAt, issuedBy }. Existing certificates remain viewable even if the course assessment changes.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'enrollmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'success/data envelope containing certificate metadata or null' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Completion read permission required' },
            '404': { description: 'Enrollment not found' },
            '422': { description: 'Invalid enrollment UUID' },
          },
        },
        post: {
          tags: ['Training Awareness'],
          summary: 'Issue training completion certificate (UC80)',
          description:
            'Requires training-certificates.issue. No request body. Requires completed enrollment, 100% progress, completedAt and a submitted passing attempt for the latest course quiz. Creates one certificate per enrollment and its audit record atomically. Repeated requests return the existing certificate. Returns the same metadata as GET; no PDF file is generated.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'enrollmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'success/data envelope containing the persisted certificate' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Certificate issue permission required' },
            '404': { description: 'Enrollment not found' },
            '409': { description: 'Course not completed or assessment not passed' },
            '422': { description: 'Invalid enrollment UUID' },
          },
        },
      },
      '/training/completion': {
        get: {
          tags: ['Training Awareness'],
          summary: 'Track training campaign completion',
          description:
            'Requires training-completion.read. Returns paginated campaign-level completion metrics. Optional courseId (UUID) limits results to that exact course.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'courseId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          ],
          responses: {
            '200': { description: 'Paginated training completion summary' },
            '401': { description: 'Authentication required' },
            '403': { description: 'training-completion.read permission required' },
          },
        },
      },
      '/training/completion/{campaignId}': {
        get: {
          tags: ['Training Awareness'],
          summary: 'View employee completion for a training campaign',
          description:
            "Requires training-completion.read. Supports employee search and enrollment-status filtering. Returns campaign-wide completion metrics plus each employee's required-lesson completion, final-assessment result, activity, enrollment progress and nullable certificateNumber.",
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'campaignId',
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
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['all', 'assigned', 'in_progress', 'completed', 'overdue', 'withdrawn'],
                default: 'all',
              },
            },
          ],
          responses: {
            '200': { description: 'Paginated employee completion details' },
            '403': { description: 'training-completion.read permission required' },
            '404': { description: 'Training campaign not found' },
          },
        },
      },
      '/training/assessments': {
        get: {
          tags: ['Training Awareness'],
          summary: 'List post-training assessments assigned to the current employee',
          description:
            'Requires training-assessments.take. Results are scoped to authenticated-user enrollments and never expose correct options.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
          ],
          responses: {
            '200': { description: 'Paginated assigned assessment list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'training-assessments.take permission required' },
          },
        },
      },
      '/training/assessments/{enrollmentId}': {
        get: {
          tags: ['Training Awareness'],
          summary: 'Get an assigned post-training assessment',
          description:
            'Requires training-assessments.take. Returns questions and choices only when the enrollment belongs to the current employee.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'enrollmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Assessment questions without answer keys' },
            '403': { description: 'training-assessments.take permission required' },
            '404': { description: 'Assigned assessment not found' },
          },
        },
      },
      '/training/assessments/{enrollmentId}/attempts': {
        post: {
          tags: ['Training Awareness'],
          summary: 'Submit a post-training assessment attempt',
          description:
            'Requires training-assessments.take. Validates enrollment ownership and attempt limits, scores answers server-side, updates training progress and records an audit event atomically.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'enrollmentId',
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
                  required: ['answers'],
                  additionalProperties: false,
                  properties: {
                    answers: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 200,
                      items: {
                        type: 'object',
                        required: ['questionId', 'optionIds'],
                        additionalProperties: false,
                        properties: {
                          questionId: { type: 'string', format: 'uuid' },
                          optionIds: {
                            type: 'array',
                            minItems: 1,
                            maxItems: 20,
                            uniqueItems: true,
                            items: { type: 'string', format: 'uuid' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Assessment scored and attempt recorded' },
            '404': { description: 'Assigned assessment not found' },
            '409': { description: 'Maximum attempts reached' },
            '422': { description: 'Answers are incomplete or invalid' },
          },
        },
      },
      '/training/courses': {
        get: {
          tags: ['Training Awareness'],
          summary: 'List security awareness courses',
          description: 'Requires training-courses.read.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          ],
          responses: {
            '200': { description: 'Paginated training course list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'training-courses.read permission required' },
            '422': { description: 'Invalid query' },
          },
        },
        post: {
          tags: ['Training Awareness'],
          summary: 'Create security awareness course draft',
          description:
            'Requires training-courses.create. Creates draft and audit record atomically.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateTrainingCourseRequest' },
              },
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['payload'],
                  properties: {
                    payload: {
                      type: 'string',
                      description: 'JSON encoded CreateTrainingCourseRequest, maximum 1 MiB',
                    },
                  },
                  additionalProperties: { type: 'string', format: 'binary' },
                  description:
                    'File fields are UUID uploadKeys referenced by materials. Up to 10 PDF/MP4/WebM files, each at most 20 MiB. Local storage requires a persistent server filesystem, not Vercel.',
                },
              },
            },
          },
          responses: {
            '201': { description: 'Draft course created' },
            '413': { description: 'Upload exceeds the per-file limit' },
            '503': { description: 'Local storage is not supported in this deployment' },
            '401': { description: 'Authentication required' },
            '403': { description: 'training-courses.create permission required' },
            '422': { description: 'Invalid course data' },
          },
        },
      },
      '/training/courses/{courseId}/content': {
        get: {
          tags: ['Training Awareness'],
          summary: 'View ordered lessons and materials',
          security: [{ bearerAuth: [] }],
          description:
            'Requires training-courses.read. Returns lesson/material metadata and quiz summaries, never correct answers or storage keys.',
          parameters: [
            {
              name: 'courseId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description:
                'Success envelope containing lessons with materials and assessment summaries',
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'Permission required' },
            '404': { description: 'Course not found' },
            '422': { description: 'Invalid course ID' },
          },
        },
      },
      '/training/courses/{courseId}': {
        get: {
          tags: ['Training Awareness'],
          summary: 'Get an editable security awareness course draft (UC160)',
          description:
            'Requires training-courses.update. Returns the complete unassigned draft, including correct-answer metadata and private-file metadata needed to prefill the editor.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'courseId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Complete editable draft' },
            '403': { description: 'training-courses.update permission required' },
            '404': { description: 'Course not found' },
            '409': { description: 'Course is not a draft or has assignments' },
          },
        },
        patch: {
          tags: ['Training Awareness'],
          summary: 'Edit a security awareness course draft (UC160)',
          description:
            'Requires training-courses.update. Atomically replaces an unassigned draft’s lessons, materials and assessments. expectedUpdatedAt prevents lost updates. Existing private files may be retained; replacement files use UUID upload keys. No schema change.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'courseId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { type: 'object' } },
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['payload'],
                  properties: { payload: { type: 'string' } },
                  additionalProperties: { type: 'string', format: 'binary' },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Draft updated and audited' },
            '403': { description: 'training-courses.update permission required' },
            '404': { description: 'Course not found' },
            '409': { description: 'Not editable or stale draft' },
            '422': { description: 'Invalid draft or file references' },
          },
        },
      },
      '/training/materials/{materialId}/download': {
        get: {
          tags: ['Training Awareness'],
          summary: 'Download a private uploaded course material',
          security: [{ bearerAuth: [] }],
          description:
            'Requires training-courses.read. Attachment download from local persistent storage. No public static uploads directory.',
          parameters: [
            {
              name: 'materialId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'File attachment' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Permission required' },
            '404': { description: 'File unavailable' },
            '422': { description: 'Invalid material ID' },
          },
        },
      },
      '/training/assignment-options': {
        get: {
          tags: ['Training Awareness'],
          summary: 'List course assignment targets',
          description:
            'Requires training-courses.assign. Returns bounded active user and department options.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'userQ', in: 'query', schema: { type: 'string', maxLength: 100 } },
            { name: 'departmentQ', in: 'query', schema: { type: 'string', maxLength: 100 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
          ],
          responses: {
            '200': { description: 'Active users and departments' },
            '401': { description: 'Authentication required' },
            '403': { description: 'training-courses.assign permission required' },
          },
        },
      },
      '/training/courses/{courseId}/assignments': {
        get: {
          tags: ['Training Awareness'],
          summary: 'Get the current course assignment',
          description:
            'Requires training-courses.assign. Returns the latest campaign dates and selected user and department targets, or null when the course has not been assigned.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'courseId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Current assignment or null' },
            '403': { description: 'training-courses.assign permission required' },
          },
        },
        post: {
          tags: ['Training Awareness'],
          summary: 'Assign a training course',
          description:
            'Requires training-courses.assign and a published course. Draft courses return 409; archived courses cannot be assigned. Set createNewCampaign=true for a separate training cycle with fresh enrollments. Otherwise the latest campaign is updated; existing progress and completed results are preserved. The operation records an audit event atomically.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'courseId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssignTrainingCourseRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Course assignment campaign created or updated' },
            '409': { description: 'Publish the course before assigning it' },
            '404': { description: 'Course not found' },
            '422': { description: 'Invalid dates or assignment targets' },
          },
        },
      },
      '/training/learning': {
        get: {
          tags: ['Training Awareness'],
          summary: 'List courses assigned to the current employee',
          description:
            'Requires training-assessments.take. Progress and results are campaign enrollment scoped.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
          ],
          responses: {
            '200': { description: 'Paginated assigned courses' },
            '403': { description: 'Learner permission required' },
          },
        },
      },
      '/training/learning/{enrollmentId}': {
        get: {
          tags: ['Training Awareness'],
          summary: 'Open an assigned course',
          description:
            'Returns ordered lessons, safe material metadata and assessment status for the enrollment owner only.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'enrollmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Assigned course content' },
            '404': { description: 'Enrollment not found or not owned by caller' },
          },
        },
      },
      '/training/learning/{enrollmentId}/lessons/{lessonId}/complete': {
        patch: {
          tags: ['Training Awareness'],
          summary: 'Complete an assigned lesson',
          description:
            'Requires ownership and campaign availability. A lesson assessment must be passed first when configured. Recomputes enrollment progress atomically.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'enrollmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              name: 'lessonId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Lesson and enrollment progress updated' },
            '409': { description: 'Assessment required or campaign unavailable' },
          },
        },
      },
      '/ai-alerts/{alertId}/false-positive': {
        post: {
          tags: ['AI Alerts'],
          summary: 'Mark an AI alert as false positive',
          description:
            'Requires ai-alerts.mark-false-positive. Transitions new/reviewing alerts to false_positive and atomically records reviewer, feedback and audit. Repeating the action returns changed=false without duplicate feedback. Confirmed/closed alerts return 409. Feedback is retained for analysis; no model training is triggered.',
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
                  properties: { comment: { type: 'string', minLength: 1, maxLength: 2000 } },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Review result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [true] },
                      data: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          alertCode: { type: 'string' },
                          status: { type: 'string', enum: ['false_positive'] },
                          reviewedByUserId: { type: 'string', format: 'uuid', nullable: true },
                          reviewedAt: { type: 'string', format: 'date-time', nullable: true },
                          changed: { type: 'boolean' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'Missing permission' },
            '404': { description: 'Alert not found' },
            '409': { description: 'Incompatible alert status' },
            '422': { description: 'Invalid UUID or body' },
            '500': { description: 'Internal error; transaction rolled back' },
          },
        },
      },
      '/access-control/permissions': {
        get: {
          tags: ['Role Management'],
          summary: 'List the permission catalog',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1, minimum: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 100, minimum: 1, maximum: 200 },
            },
            {
              name: 'search',
              in: 'query',
              schema: { type: 'string', minLength: 1, maxLength: 100 },
            },
            {
              name: 'module',
              in: 'query',
              schema: { type: 'string', minLength: 1, maxLength: 100 },
            },
            {
              name: 'sortBy',
              in: 'query',
              schema: { type: 'string', enum: ['code', 'module', 'action'], default: 'code' },
            },
            {
              name: 'sortOrder',
              in: 'query',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
            },
          ],
          responses: {
            '200': { description: 'Paginated permission catalog' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing roles.read permission' },
            '422': { description: 'Invalid query parameters' },
          },
        },
      },
      '/access-control/roles': {
        get: {
          tags: ['Role Management'],
          summary: 'View system and custom roles',
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
            '200': { description: 'Paginated system and custom roles' },
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
          summary: 'View role details',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'System or custom role details' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing roles.read permission' },
            '404': { description: 'Role not found' },
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
              description: 'Authenticated, or MFA challenge required before tokens are issued',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        oneOf: [
                          { $ref: '#/components/schemas/TokenPair' },
                          { $ref: '#/components/schemas/MfaChallenge' },
                        ],
                      },
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
      '/auth/password-reset/request': {
        post: {
          tags: ['Authentication'],
          summary: 'Request a password reset',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RequestPasswordReset' } },
            },
          },
          responses: {
            '202': { description: 'Reset request accepted without revealing account existence' },
            '422': { description: 'Invalid email address' },
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
                schema: { $ref: '#/components/schemas/ChangePasswordRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Password changed and existing refresh sessions revoked',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          message: {
                            type: 'string',
                            example: 'Password changed successfully. Please log in again.',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Current password is incorrect or new password is unchanged' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Account is inactive' },
            '422': { description: 'Invalid password policy or confirmation' },
          },
        },
      },
      '/auth/mfa/setup': {
        post: {
          tags: ['Authentication'],
          summary: 'Start authenticator-app MFA setup',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SetupMfaRequest' } },
            },
          },
          responses: {
            '200': {
              description:
                'Authenticator URI, manual key, one-time QR code, and safety warning returned',
            },
            '400': { description: 'Current password is incorrect' },
            '401': { description: 'Unauthorized' },
            '409': { description: 'MFA is already enabled' },
          },
        },
      },
      '/auth/mfa/verify': {
        post: {
          tags: ['Authentication'],
          summary: 'Verify an authenticator code and enable MFA',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyMfaRequest' } },
            },
          },
          responses: {
            '200': { description: 'MFA enabled and recovery codes returned once' },
            '400': { description: 'MFA code is invalid or expired' },
            '401': { description: 'Unauthorized' },
            '404': { description: 'MFA setup is required' },
            '429': { description: 'Too many attempts' },
          },
        },
      },
      '/auth/mfa/challenge/verify': {
        post: {
          tags: ['Authentication'],
          summary: 'Complete sign-in using an MFA login challenge',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VerifyMfaChallengeRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Challenge consumed and access/refresh tokens issued',
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
            '401': { description: 'Invalid, expired, used, or exhausted challenge/code' },
            '403': { description: 'Account is inactive' },
            '422': { description: 'Invalid challenge or code format' },
            '429': { description: 'Too many attempts from this IP' },
          },
        },
      },
      '/auth/mfa/disable': {
        post: {
          tags: ['Authentication'],
          summary: 'Disable authenticator MFA and revoke existing sessions',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/DisableMfaRequest' } },
            },
          },
          responses: {
            '200': { description: 'MFA disabled and existing sessions revoked' },
            '400': { description: 'Current password or authenticator code is invalid' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Account is inactive' },
            '409': { description: 'MFA is not enabled' },
            '422': { description: 'Invalid request body' },
            '429': { description: 'Too many attempts' },
          },
        },
      },
      '/auth/mfa/recovery-requests': {
        post: {
          tags: ['Authentication'],
          summary: 'Request administrator-assisted MFA recovery from a current login challenge',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateMfaRecoveryRequest' },
              },
            },
          },
          responses: {
            '202': { description: 'Recovery request created or existing pending request returned' },
            '401': { description: 'Challenge is invalid or expired' },
            '422': { description: 'Invalid request body' },
            '429': { description: 'Too many requests from this IP' },
            '503': { description: 'Recovery workflow is unavailable' },
          },
        },
      },
      '/admin/mfa-recovery-requests': {
        get: {
          tags: ['MFA Recovery Administration'],
          summary: 'List MFA recovery requests',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            },
          ],
          responses: {
            '200': {
              description: 'Paginated recovery requests with user and latest decision details',
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing mfa-recovery.manage permission' },
          },
        },
      },
      '/admin/mfa-recovery-requests/{requestId}/approve': {
        post: {
          tags: ['MFA Recovery Administration'],
          summary: 'Approve an MFA recovery request',
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
                schema: { $ref: '#/components/schemas/DecideMfaRecoveryRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'MFA cleared, sessions revoked, action audited, and user notified',
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing mfa-recovery.manage permission' },
            '404': { description: 'Request not found' },
            '409': { description: 'Request was already decided' },
            '422': { description: 'Invalid request ID or reason' },
          },
        },
      },
      '/admin/mfa-recovery-requests/{requestId}/reject': {
        post: {
          tags: ['MFA Recovery Administration'],
          summary: 'Reject an MFA recovery request',
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
                schema: { $ref: '#/components/schemas/DecideMfaRecoveryRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Request rejected, action audited, and user notified' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing mfa-recovery.manage permission' },
            '404': { description: 'Request not found' },
            '409': { description: 'Request was already decided' },
            '422': { description: 'Invalid request ID or reason' },
          },
        },
      },
      '/auth/password-reset/confirm': {
        post: {
          tags: ['Authentication'],
          summary: 'Set a new password with a reset token',
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ConfirmPasswordReset' } },
            },
          },
          responses: {
            '200': {
              description: 'Password reset and existing sessions revoked',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          message: {
                            type: 'string',
                            example:
                              'Password reset successfully. Please log in with your new password.',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Reset token is invalid or expired' },
            '422': { description: 'Invalid reset request' },
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
            '200': {
              description: 'Current user and effective permissions',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/CurrentUser' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/users': {
        get: {
          tags: ['Users'],
          summary: 'List user accounts',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            },
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Search name, email, or employee code',
            },
            { name: 'departmentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'roleCode', in: 'query', schema: { type: 'string' } },
            {
              name: 'status',
              in: 'query',
              schema: { type: 'string', enum: ['active', 'inactive', 'locked', 'disabled'] },
            },
          ],
          responses: {
            '200': { description: 'Paginated user list and status summary' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing users.read permission' },
          },
        },
        post: {
          tags: ['Users'],
          summary: 'Initialize a user account',
          description:
            'Admin-only account initialization. Creates the account and emails an eight-digit temporary password that the user must change after signing in.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InitializeUserAccountRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'User account created and temporary password email sent' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing users.create permission' },
            '409': { description: 'Email or employee code already exists' },
            '422': { description: 'Invalid role, department, or request body' },
            '503': { description: 'Email service is not configured or unavailable' },
          },
        },
      },
      '/users/{userId}': {
        get: {
          tags: ['Users'],
          summary: 'View a user account',
          description:
            'Returns safe account, department, role, MFA, and activity metadata. Requires users.read.',
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
            '200': {
              description: 'User account details',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/UserDetail' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Missing users.read permission' },
            '404': { description: 'User was not found' },
            '422': { description: 'Invalid user identifier' },
          },
        },
      },
      '/risks': {
        post: {
          tags: ['Risk Assessments'],
          summary: 'Create a risk assessment draft',
          description:
            'Requires risks.create. Exactly one asset or business process target is required. The backend assigns the assessor, generates the risk code, and calculates score and level.',
          security: [{ bearerAuth: [] }],
          responses: {
            '201': { description: 'Risk assessment draft created' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The risks.create permission is required' },
            '404': { description: 'Target or linked catalog item not found' },
            '409': { description: 'Potential duplicate open risk' },
            '422': { description: 'Invalid request or inactive target' },
          },
        },
        get: {
          tags: ['Risk Assessments'],
          summary: 'List risk assessments',
          description:
            'Requires risks.read. Search, filtering, sorting and pagination are performed by the backend.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
            {
              name: 'riskLevel',
              in: 'query',
              schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: [
                  'draft',
                  'pending_approval',
                  'approved',
                  'in_treatment',
                  'closed',
                  'rejected',
                  'cancelled',
                ],
              },
            },
            {
              name: 'targetType',
              in: 'query',
              schema: { type: 'string', enum: ['asset', 'business_process'] },
            },
            { name: 'assessedFrom', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'assessedTo', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'hasTreatmentPlan', in: 'query', schema: { type: 'boolean' } },
            {
              name: 'sortBy',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['riskCode', 'title', 'riskScore', 'riskLevel', 'assessedAt', 'updatedAt'],
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
            '200': { description: 'Paginated risk assessment list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The risks.read permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
      },
      '/risks/create-options': {
        get: {
          tags: ['Risk Assessments'],
          summary: 'List valid options for creating a risk assessment',
          description:
            'Requires risks.create or risks.update. Returns one paginated option type at a time for active targets and threat/vulnerability catalog entries.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'type',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
                enum: ['assets', 'businessProcesses', 'threats', 'vulnerabilities'],
              },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            '200': { description: 'Risk creation options' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The risks.create or risks.update permission is required' },
            '422': { description: 'Invalid option type, search, or pagination parameters' },
          },
        },
      },
      '/risks/{riskAssessmentId}': {
        patch: {
          tags: ['Risk Assessments'],
          summary: 'Update a draft or rejected risk assessment',
          description:
            'Requires risks.update. Only the assessor or an administrator may edit a draft or rejected assessment. Rejected assessments keep their original target. Assessments with a treatment plan or incident link cannot be edited. Recalculates score and level, replaces linked threats and vulnerabilities transactionally, and uses expectedUpdatedAt for optimistic concurrency.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'riskAssessmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Updated risk assessment detail' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The risks.update permission is required' },
            '404': { description: 'Risk assessment or target not found' },
            '409': {
              description:
                'Potential duplicate, concurrent modification, treatment plan, or incident link',
            },
            '422': { description: 'Invalid input, inactive target, or non-editable status' },
          },
        },
        get: {
          tags: ['Risk Assessments'],
          summary: 'View risk assessment details',
          description:
            'Requires risks.read. Returns the assessment target, risk analysis, linked threats and vulnerabilities, treatment plans and the previous assessment.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'riskAssessmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Risk assessment details' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The risks.read permission is required' },
            '404': { description: 'Risk assessment not found' },
            '422': { description: 'Invalid risk assessment ID' },
          },
        },
      },
      '/risks/{riskAssessmentId}/cancel': {
        post: {
          tags: ['Risk Assessments'],
          summary: 'Cancel a draft or rejected risk assessment',
          description:
            'Requires risks.cancel. Only the assessor or an administrator can cancel a draft or rejected assessment. Assessments with a treatment plan, incident link, or later assessment cannot be cancelled. The actor is revalidated inside the transaction, expectedUpdatedAt protects against concurrent changes, and the cancellation remains auditable.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'riskAssessmentId',
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
                  required: ['reason', 'expectedUpdatedAt'],
                  properties: {
                    reason: { type: 'string', minLength: 10, maxLength: 1000 },
                    expectedUpdatedAt: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Cancelled risk assessment detail' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Missing permission or actor is not the assessor/admin' },
            '404': { description: 'Risk assessment not found' },
            '409': {
              description:
                'Treatment plan, incident link, later assessment, or concurrent change prevents cancellation',
            },
            '422': { description: 'Invalid input or assessment status is not cancellable' },
          },
        },
      },
      '/risks/treatment-plans/{treatmentPlanId}/submit': {
        post: {
          tags: ['Risk Assessments'],
          summary: 'Submit a risk treatment plan for approval',
          description:
            'Requires risk-treatment-plans.submit. The plan must be a complete draft or rejected plan owned or created by the caller (unless administrator), its risk must be approved, and exactly one active approval workflow with enough direct or delegated independent approvers must exist. Submission stores an immutable review snapshot and note; the approval request, notifications, and audit data are created atomically.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'treatmentPlanId',
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
                  required: ['expectedUpdatedAt'],
                  properties: {
                    expectedUpdatedAt: { type: 'string', format: 'date-time' },
                    submissionNote: { type: 'string', maxLength: 1000 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Treatment plan submitted and approval request created' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Missing permission or caller does not own the plan' },
            '404': { description: 'Treatment plan not found' },
            '409': { description: 'Plan already submitted, started, or changed concurrently' },
            '422': {
              description:
                'Plan is incomplete, risk is not approved, or approval workflow is unavailable',
            },
          },
        },
      },
      '/risks/treatment-plans/{treatmentPlanId}/approve': {
        post: {
          tags: ['Risk Assessments'],
          summary: 'Approve the current step of a risk treatment plan',
          description:
            'Requires risk-treatment-plans.approve. The caller must be an active direct or delegated approver for the current workflow step and cannot approve their own submission. The submitted snapshot is checked before recording one approval per actor and step. Completing the final step approves the treatment plan atomically.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'treatmentPlanId',
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
                  required: ['approvalRequestId'],
                  properties: {
                    approvalRequestId: { type: 'string', format: 'uuid' },
                    comment: { type: 'string', maxLength: 1000 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Approval recorded and workflow advanced when applicable' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Missing permission, self-approval, or ineligible approver' },
            '404': { description: 'Treatment plan or approval request not found' },
            '409': {
              description: 'Request completed, duplicate decision, or submitted data changed',
            },
            '422': { description: 'Plan or workflow is no longer valid' },
            '503': { description: 'Approval temporarily unavailable' },
          },
        },
      },
      '/assets': {
        post: {
          tags: ['Assets'],
          summary: 'Create an IT asset',
          description:
            'Creates an active asset with medium criticality and atomically records its change history and audit log. Criticality can only be changed through the classification endpoint. Requires the assets.create permission.',
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
      '/assets/create-options': {
        get: {
          tags: ['Assets'],
          summary: 'List options for creating an asset',
          description:
            'Returns up to 200 active departments and active, non-deleted users for the Create, Edit or Assign Asset Owner form. Requires the assets.create, assets.update or assets.assign-owner permission.',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Active department and owner options',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        required: ['departments', 'owners', 'truncated'],
                        properties: {
                          departments: {
                            type: 'array',
                            items: {
                              type: 'object',
                              required: ['id', 'code', 'name'],
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                code: { type: 'string' },
                                name: { type: 'string' },
                              },
                            },
                          },
                          owners: {
                            type: 'array',
                            items: {
                              type: 'object',
                              required: ['id', 'fullName', 'employeeCode'],
                              properties: {
                                id: { type: 'string', format: 'uuid' },
                                fullName: { type: 'string' },
                                employeeCode: { type: ['string', 'null'] },
                              },
                            },
                          },
                          truncated: {
                            type: 'object',
                            required: ['departments', 'owners'],
                            properties: {
                              departments: { type: 'boolean' },
                              owners: { type: 'boolean' },
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
            '403': {
              description:
                'The assets.create, assets.update or assets.assign-owner permission is required',
            },
            '500': { description: 'Unexpected server error' },
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
            'Exports up to 10000 non-deleted assets using the same search, filter and sorting rules as the asset list. The workbook includes configured organization details, the export time, and the authenticated exporter role names and full name. Requires the assets.export permission.',
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
            'Creates valid assets from an .xlsx file and returns per-row errors without updating existing assets. Asset codes belonging to soft-deleted assets are skipped with ASSET_CODE_DELETED because they cannot be reused. Maximum 5 MB and 1000 non-empty rows. Requires the assets.import permission.',
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
        get: {
          tags: ['Assets'],
          summary: 'View IT asset details',
          description:
            'Returns complete details for one non-deleted asset. Requires the assets.read permission.',
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
            '200': {
              description: 'Asset details',
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
            '403': { description: 'The assets.read permission is required' },
            '404': { description: 'Asset was not found or was deleted' },
            '422': { description: 'Invalid asset ID' },
            '429': { description: 'Too many requests' },
            '500': { description: 'Unexpected server error' },
          },
        },
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
      '/compliance/policies/drafts/reviewable': {
        get: {
          tags: ['Policies'],
          summary: 'List policy drafts available for Admin publication review',
          description: 'Requires policies.publish and returns only policies with a draft version.',
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
            '200': { description: 'Paginated publishable policy draft list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.publish permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
      },
      '/compliance/policies/{policyId}/versions/{versionId}/review': {
        get: {
          tags: ['Policies'],
          summary: 'Review a draft policy version before publication',
          description: 'Requires policies.publish and returns the complete draft content.',
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
            '200': {
              description: 'Draft policy version detail',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/DraftPolicyVersionDetail' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.publish permission is required' },
            '404': { description: 'Draft policy version was not found' },
            '422': { description: 'Invalid policy or version ID' },
          },
        },
      },
      '/compliance/policies/published/mine': {
        get: {
          tags: ['Policy Compliance'],
          summary: 'List owned published policies eligible for a new version',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Owned published policies without an existing draft' },
            '401': { description: 'Authentication required' },
            '403': { description: 'Missing policies.update permission' },
          },
        },
      },
      '/compliance/policies/drafts/mine': {
        get: {
          tags: ['Policies'],
          summary: 'List policy drafts owned by the current user',
          description:
            'Requires policies.create. Results are bounded and never include other owners.',
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
              name: 'sortOrder',
              in: 'query',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            },
          ],
          responses: {
            '200': { description: 'Paginated owned draft list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.create permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
      },
      '/compliance/policy-control-mappings': {
        get: {
          tags: ['Policies'],
          summary: 'List published policy versions and standard control mappings',
          description: 'Requires compliance.map-controls. Results are paginated.',
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
            '200': { description: 'Published policy versions and mappings' },
            '403': { description: 'The compliance.map-controls permission is required' },
          },
        },
      },
      '/compliance/frameworks': {
        get: {
          tags: ['Policies'],
          summary: 'List compliance frameworks available for mapping',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Compliance frameworks and control counts' },
            '403': { description: 'The compliance.map-controls permission is required' },
          },
        },
      },
      '/compliance/frameworks/{frameworkId}/controls': {
        get: {
          tags: ['Policies'],
          summary: 'List controls in a compliance framework',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'frameworkId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
          ],
          responses: {
            '200': { description: 'Framework controls' },
            '404': { description: 'Compliance framework not found' },
          },
        },
      },
      '/compliance/policies/{policyId}/versions/{versionId}/frameworks/{frameworkId}/control-mappings':
        {
          put: {
            tags: ['Policies'],
            summary: 'Replace a policy version mapping for one framework',
            description:
              'Requires compliance.map-controls. Mappings for other frameworks are preserved.',
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
              {
                name: 'frameworkId',
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
                    required: ['mappings'],
                    properties: {
                      mappings: {
                        type: 'array',
                        maxItems: 100,
                        items: {
                          type: 'object',
                          required: ['controlId'],
                          properties: {
                            controlId: { type: 'string', format: 'uuid' },
                            notes: { type: 'string', nullable: true, maxLength: 1000 },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': { description: 'Framework mappings replaced' },
              '404': { description: 'Published policy version not found' },
              '422': { description: 'A selected control does not belong to the framework' },
            },
          },
        },
      '/compliance/policies/department-assignments': {
        get: {
          tags: ['Policies'],
          summary: 'List published policies and their department assignments',
          description:
            'Requires policies.assign-department. Returns published policies and active departments.',
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
            '200': { description: 'Paginated published policies and active departments' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.assign-department permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
      },
      '/compliance/policies/acknowledgements/mine': {
        get: {
          tags: ['Policies'],
          summary: 'List published policies applicable to the current employee',
          description: 'Requires policies.acknowledge and scopes results by employee department.',
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
              schema: { type: 'string', enum: ['all', 'pending', 'acknowledged'], default: 'all' },
            },
          ],
          responses: {
            '200': { description: 'Applicable policy list' },
            '403': { description: 'Missing policies.acknowledge permission' },
          },
        },
      },
      '/compliance/policies/{policyId}/versions/{versionId}/acknowledgement': {
        get: {
          tags: ['Policies'],
          summary: 'Read an applicable published policy version',
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
            '200': { description: 'Published policy content and acknowledgement state' },
            '404': { description: 'Policy is unavailable or not applicable to the employee' },
          },
        },
      },
      '/compliance/policies/{policyId}/versions/{versionId}/acknowledgements': {
        post: {
          tags: ['Policies'],
          summary: 'Confirm reading and understanding of a policy version',
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
            '404': { description: 'Policy is unavailable or not applicable to the employee' },
          },
        },
      },
      '/compliance/policies/{policyId}/departments': {
        put: {
          tags: ['Policies'],
          summary: 'Replace a published policy department assignment set',
          description:
            'Requires policies.assign-department. An empty list clears all department assignments.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'policyId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AssignPolicyDepartmentsRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Department assignments replaced and audited' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.assign-department permission is required' },
            '404': { description: 'Published policy not found' },
            '422': { description: 'Invalid policy ID, body, or inactive department' },
          },
        },
      },
      '/compliance/policies/{policyId}/drafts/{versionId}': {
        get: {
          tags: ['Policies'],
          summary: 'Get an owned policy draft',
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
            '200': { description: 'Owned policy draft detail' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.create permission is required' },
            '404': { description: 'Draft not found or not owned by the caller' },
            '422': { description: 'Invalid policy or version ID' },
          },
        },
        patch: {
          tags: ['Policies'],
          summary: 'Update an owned policy draft',
          description: 'Only a draft owned and created by the caller can be changed.',
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
                schema: { $ref: '#/components/schemas/UpdatePolicyDraftRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Policy draft updated and audited' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.create permission is required' },
            '404': { description: 'Draft not found or not editable by the caller' },
            '409': { description: 'Version number already exists' },
            '422': { description: 'Invalid IDs or request body' },
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
      '/ai-alerts/thresholds': {
        get: {
          tags: ['AI Alerts'],
          summary: 'List custom alert thresholds',
          description:
            'Returns paginated per-asset thresholds. Requires ai-alerts.thresholds.manage.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', minLength: 1, maxLength: 100 } },
          ],
          responses: {
            '200': { description: 'Paginated alert threshold list' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-alerts.thresholds.manage permission is required' },
            '422': { description: 'Invalid query parameters' },
          },
        },
      },
      '/ai-alerts/thresholds/{assetId}': {
        put: {
          tags: ['AI Alerts'],
          summary: 'Set a custom alert threshold for an asset',
          description:
            'Creates or replaces the single threshold assigned to an asset and records an audit event. Requires ai-alerts.thresholds.manage.',
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
                schema: { $ref: '#/components/schemas/SetAlertThresholdRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Alert threshold saved' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-alerts.thresholds.manage permission is required' },
            '404': { description: 'Asset not found' },
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
            'Returns generated alert summaries, including nullable AI-suggested riskScore and riskLevel from the alert record. Use detectedAfter and the returned serverTime watermark for near-real-time polling. Requires ai-alerts.read.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'q',
              in: 'query',
              description:
                'Case-insensitive search by alert code, title, log source, or asset name',
              schema: { type: 'string', minLength: 1, maxLength: 100 },
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
      '/ai-alerts/{alertId}/explanation': {
        get: {
          tags: ['AI Alerts'],
          summary: 'View the latest explanation of an AI alert decision',
          description:
            'Returns the newest stored explanation for an alert, or data=null when no explanation has been recorded. Requires ai-alerts.read, granted to Security Officer and Executive by the role seed.',
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
            '200': {
              description: 'Latest AI decision explanation, or null if unavailable',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', enum: [true] },
                      data: {
                        nullable: true,
                        type: 'object',
                        required: [
                          'id',
                          'alertId',
                          'explanationText',
                          'featureContributions',
                          'baselineData',
                          'createdAt',
                        ],
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          alertId: { type: 'string', format: 'uuid' },
                          explanationText: { type: 'string' },
                          featureContributions: { nullable: true },
                          baselineData: { nullable: true },
                          createdAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-alerts.read permission is required' },
            '404': { description: 'AI alert was not found' },
            '422': { description: 'Invalid alert ID' },
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
        get: {
          tags: ['AI Alerts'],
          summary: 'List reliability feedback for an AI alert',
          description:
            'Returns a paginated history of analyst assessments. Requires ai-alerts.feedback.',
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
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'sortOrder',
              in: 'query',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            },
          ],
          responses: {
            '200': { description: 'Paginated alert feedback history' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The ai-alerts.feedback permission is required' },
            '404': { description: 'AI alert was not found' },
            '422': { description: 'Invalid alert ID or pagination query' },
          },
        },
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
            'Moves a new or reviewing alert to confirmed, automatically creates and links an incident draft, and records analyst feedback and audit data atomically. Repeating the action returns the existing linked incident without creating a duplicate. Requires ai-alerts.confirm.',
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
            '200': {
              description: 'Alert confirmation and linked incident result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', enum: [true] },
                      data: {
                        type: 'object',
                        required: ['id', 'alertCode', 'status', 'changed', 'incident'],
                        properties: {
                          id: { type: 'string', format: 'uuid' },
                          alertCode: { type: 'string' },
                          status: { type: 'string', enum: ['confirmed'] },
                          changed: { type: 'boolean' },
                          incident: {
                            type: 'object',
                            required: ['id', 'code', 'status', 'created'],
                            properties: {
                              id: { type: 'string', format: 'uuid' },
                              code: { type: 'string' },
                              status: { type: 'string' },
                              created: { type: 'boolean' },
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
      '/compliance/policies/version-history': {
        get: {
          tags: ['Policies'],
          summary: 'List policy version history',
          description: 'Available to every authenticated role.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 255 } },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['all', 'draft', 'published', 'archived'],
                default: 'all',
              },
            },
          ],
          responses: {
            '200': { description: 'Paginated policy version history' },
            '401': { description: 'Authentication required' },
          },
        },
      },
      '/compliance/policies/{policyId}/versions/{versionId}/history': {
        get: {
          tags: ['Policies'],
          summary: 'Get policy version history detail',
          description: 'Available to every authenticated role.',
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
            '200': { description: 'Policy version metadata and content' },
            '401': { description: 'Authentication required' },
            '404': { description: 'Policy version not found' },
          },
        },
      },
      '/compliance/policies/{policyId}/versions': {
        post: {
          tags: ['Policies'],
          summary: 'Update a published policy and create a new draft version',
          description:
            'Requires policies.update. Only the owning Security Officer can create one draft version at a time from a published policy. The current published version remains unchanged until Admin publishes the new draft.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'policyId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdatePolicyCreateVersionRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Policy updated and new draft version created with an audit record',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['success', 'data'],
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/NewPolicyVersion' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Authentication required' },
            '403': { description: 'The policies.update permission is required' },
            '404': { description: 'Owned policy was not found' },
            '409': {
              description:
                'Policy is archived, is not published, already has a draft, or version number exists',
            },
            '422': { description: 'Invalid policy ID or request body' },
          },
        },
      },
      '/compliance/control-assessments': {
        get: {
          tags: ['Policies'],
          summary: 'List framework controls and their latest compliance assessment',
          description: 'Requires compliance.assess-controls.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            { name: 'q', in: 'query', schema: { type: 'string', maxLength: 100 } },
            { name: 'frameworkId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['compliant', 'partially_compliant', 'non_compliant', 'not_assessed'],
              },
            },
            {
              name: 'reviewState',
              in: 'query',
              schema: { type: 'string', enum: ['overdue', 'due_soon', 'scheduled', 'unscheduled'] },
            },
          ],
          responses: {
            '200': { description: 'Paginated controls and framework filter options' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The compliance.assess-controls permission is required' },
          },
        },
      },
      '/compliance/controls/{controlId}/assessments': {
        get: {
          tags: ['Policies'],
          summary: 'Get the 20 most recent assessments for a control',
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
            '200': { description: 'Assessment history' },
            '404': { description: 'Control not found' },
          },
        },
        post: {
          tags: ['Policies'],
          summary: 'Record a control compliance assessment',
          description:
            'Creates an immutable history entry and audit log. Requires compliance.assess-controls.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'controlId',
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
                  required: ['complianceStatus'],
                  properties: {
                    complianceStatus: {
                      type: 'string',
                      enum: ['compliant', 'partially_compliant', 'non_compliant', 'not_assessed'],
                    },
                    score: { type: 'number', minimum: 0, maximum: 100, nullable: true },
                    notes: { type: 'string', maxLength: 5000, nullable: true },
                    nextReviewAt: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Assessment recorded' },
            '403': { description: 'The compliance.assess-controls permission is required' },
            '404': { description: 'Control not found' },
            '422': { description: 'Invalid assessment or review date' },
          },
        },
      },
      '/compliance/evidence/assessments': {
        get: {
          tags: ['Policies'],
          summary: 'List control assessments accessible for compliance evidence',
          description:
            'Requires compliance.evidence.upload. Employee results are limited to controls covered by policies assigned to their department.',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Paginated assessments and evidence' },
            '403': { description: 'Permission required' },
          },
        },
      },
      '/compliance/control-assessments/{assessmentId}/evidence': {
        post: {
          tags: ['Policies'],
          summary: 'Upload compliance evidence',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'assessmentId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    file: { type: 'string', format: 'binary' },
                    description: { type: 'string', maxLength: 2000 },
                    validUntil: { type: 'string', format: 'date' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Evidence uploaded and audited' },
            '413': { description: 'File exceeds 10 MB' },
            '422': { description: 'Invalid file or metadata' },
          },
        },
      },
      '/compliance/evidence/{evidenceId}/download': {
        get: {
          tags: ['Policies'],
          summary: 'Download accessible compliance evidence',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'evidenceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': { description: 'Evidence file' },
            '404': { description: 'Evidence is missing or inaccessible' },
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
        delete: {
          tags: ['Security Monitoring'],
          summary: 'Delete an unused log source',
          description:
            'Permanently deletes a log source only when it has no security events or AI alerts. Requires the log-sources.manage permission.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'logSourceId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '204': { description: 'Log source deleted' },
            '401': { description: 'Authentication required' },
            '403': { description: 'The log-sources.manage permission is required' },
            '404': { description: 'Log source was not found' },
            '409': { description: 'Log source has security events or alerts' },
            '422': { description: 'Invalid log source ID' },
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
      '/integrations/monitoring/connection-status': {
        get: {
          tags: ['Integrations'],
          summary: 'Get live connection monitoring summary for all integrations',
          description:
            'Requires integrations.read (Admin). Aggregates fleet availability, 24h availability rate, average latency, failing endpoints, and recent connection logs.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'timeWindow',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['24h', '7d'], default: '24h' },
            },
          ],
          responses: {
            '200': {
              description: 'Connection monitoring summary',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/ConnectionStatusSummaryResponse' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
          },
        },
      },
      '/integrations/monitoring/check-all': {
        post: {
          tags: ['Integrations'],
          summary: 'Trigger batch connection check across configured integrations',
          description:
            'Requires integrations.update (Admin). Runs throttled concurrent health checks across configured integrations.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BatchConnectionCheckRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Batch connection check results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/BatchConnectionCheckResponse' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/integrations/{id}/connection-status': {
        get: {
          tags: ['Integrations'],
          summary: 'Get detailed connection status and telemetry for an integration',
          description:
            'Requires integrations.read (Admin). Returns 24h availability rate, latency statistics, and recent probe logs.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'timeWindow',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['24h', '7d'], default: '24h' },
            },
          ],
          responses: {
            '200': {
              description: 'Detailed connection status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/IntegrationConnectionStatusResponse' },
                    },
                  },
                },
              },
            },
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
          description:
            'Requires integrations.update (Admin). Probes external base URL and updates status/latency.',
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
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
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
      '/integrations/logs/stats': {
        get: {
          tags: ['Integrations'],
          summary: 'Get aggregation statistics for integration errors and warnings (UC13.5)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'integrationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': {
              description: 'Aggregation statistics for integration errors',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          totalErrors: { type: 'integer', example: 12 },
                          totalWarnings: { type: 'integer', example: 5 },
                          failedJobsCount: { type: 'integer', example: 3 },
                          affectedIntegrationsCount: { type: 'integer', example: 2 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
          },
        },
      },
      '/integrations/logs': {
        get: {
          tags: ['Integrations'],
          summary: 'List data synchronization error logs and events across integrations (UC13.5)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            {
              name: 'level',
              in: 'query',
              schema: { type: 'string', enum: ['info', 'warn', 'error'] },
            },
            { name: 'integrationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'syncJobId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': { description: 'List of integration logs and error events' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
          },
        },
      },
      '/integrations/{id}/logs': {
        get: {
          tags: ['Integrations'],
          summary: 'List integration logs and error events for a specific integration (UC13.5)',
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
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': { description: 'List of integration logs' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
      },
      '/integrations/{id}/api-keys': {
        post: {
          tags: ['Integrations'],
          summary: 'Create and encrypt integration API key',
          description:
            'Requires integrations.update (Admin). Plaintext secret is returned only once in response.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateApiKeyRequest' },
              },
            },
          },
          responses: {
            '201': {
              description: 'API key created with one-time plaintext secret',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/ApiKeyCreatedResponse' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden - requires integrations.update' },
            '404': { description: 'Integration not found' },
          },
        },
        get: {
          tags: ['Integrations'],
          summary: 'List API keys for integration',
          description: 'Requires integrations.read (Admin). Never returns secrets.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'List of integration API keys',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ApiKeyResponse' },
                      },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Integration not found' },
          },
        },
      },
      '/integrations/{id}/api-keys/{keyId}': {
        get: {
          tags: ['Integrations'],
          summary: 'Get API key metadata',
          description: 'Requires integrations.read (Admin). Cross-tenant isolated.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'keyId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'API key metadata',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/ApiKeyResponse' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'API key or integration not found' },
          },
        },
        patch: {
          tags: ['Integrations'],
          summary: 'Update API key metadata',
          description:
            'Requires integrations.update (Admin). Allows updating keyName, expiresAt, and isActive.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'keyId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UpdateApiKeyRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'API key updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/ApiKeyResponse' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'API key or integration not found' },
          },
        },
      },
      '/integrations/{id}/api-keys/{keyId}/rotate': {
        post: {
          tags: ['Integrations'],
          summary: 'Rotate API key secret',
          description:
            'Requires integrations.update (Admin). Re-encrypts secret and returns new secret once.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'keyId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RotateApiKeyRequest' },
              },
            },
          },
          responses: {
            '200': {
              description: 'API key rotated with one-time plaintext secret',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/ApiKeyCreatedResponse' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'API key or integration not found' },
          },
        },
      },
      '/integrations/{id}/api-keys/{keyId}/revoke': {
        post: {
          tags: ['Integrations'],
          summary: 'Revoke and deactivate API key',
          description:
            'Requires integrations.update (Admin). Sets isActive to false and writes audit log.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            {
              name: 'keyId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'API key revoked',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: '#/components/schemas/ApiKeyResponse' },
                    },
                  },
                },
              },
            },
            '401': { description: 'Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'API key or integration not found' },
          },
        },
      },
    },
  },
  apis: [],
});

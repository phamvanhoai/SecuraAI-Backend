import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { approvalWorkflowRouter } from './approval-workflow.routes.js';
import { approvalWorkflowService } from './approval-workflow.service.js';
import { errorHandler } from '../../common/middleware/error-handler.js';
import { signAccessToken } from '../../common/utils/tokens.js';
import type { WorkflowDefinitionListResponseDto } from './dto/index.js';

const app = express();
app.use(express.json());
app.use('/workflow-definitions', approvalWorkflowRouter);
app.use(errorHandler);

type SuccessResponseBody = {
  success: true;
  data: WorkflowDefinitionListResponseDto;
};

type ErrorResponseBody = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

describe('approvalWorkflowRouter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const generateTestToken = (roles: string[], permissions: string[]) => {
    return signAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      roles,
      permissions,
    });
  };

  it('should return 401 when unauthenticated', async () => {
    const res = await request(app).get('/workflow-definitions');
    expect(res.status).toBe(401);
  });

  it('should return 403 when user lacks workflows.read permission', async () => {
    const token = generateTestToken(['EMPLOYEE'], ['some.other.permission']);
    const res = await request(app)
      .get('/workflow-definitions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should return 200 with workflow definitions when authorized', async () => {
    const token = generateTestToken(['ADMIN'], ['workflows.read']);
    vi.spyOn(approvalWorkflowService, 'listWorkflowDefinitions').mockResolvedValue({
      items: [
        {
          workflowId: '11111111-1111-1111-1111-111111111111',
          name: 'Risk Treatment Approval',
          description: 'Description',
          entityType: 'risk_treatment_plan',
          isActive: true,
          stepsCount: 2,
          createdBy: {
            userId: '22222222-2222-2222-2222-222222222222',
            name: 'Admin',
            email: 'admin@securaai.local',
          },
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-02T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
      summary: {
        total: 1,
        active: 1,
        inactive: 0,
      },
    });

    const res = await request(app)
      .get('/workflow-definitions?entityType=risk_treatment_plan&isActive=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const body = res.body as SuccessResponseBody;
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.summary.active).toBe(1);
  });

  it('should return 422 for invalid query parameters', async () => {
    const token = generateTestToken(['ADMIN'], ['workflows.read']);
    const res = await request(app)
      .get('/workflow-definitions?entityType=invalid_entity_type')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(422);
    const body = res.body as ErrorResponseBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

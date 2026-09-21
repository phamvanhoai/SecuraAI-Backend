import { describe, it, expect, vi, beforeEach } from 'vitest';
import { approvalWorkflowService } from './approval-workflow.service.js';
import { approvalWorkflowRepository } from './approval-workflow.repository.js';
import type { WorkflowDefinitionRecord } from './approval-workflow.mapper.js';

describe('approvalWorkflowService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return paginated workflow definitions with aggregate summary', async () => {
    const mockRecord: WorkflowDefinitionRecord = {
      workflow_definition_id: '11111111-1111-1111-1111-111111111111',
      name: 'Risk Plan Approval',
      description: 'Test workflow description',
      entity_type: 'risk_treatment_plan',
      is_active: true,
      created_at: new Date('2026-09-01T00:00:00Z'),
      updated_at: new Date('2026-09-02T00:00:00Z'),
      users: {
        user_id: '22222222-2222-2222-2222-222222222222',
        full_name: 'Admin User',
        email: 'admin@securaai.local',
      },
      _count: {
        workflow_steps: 3,
      },
    };

    vi.spyOn(approvalWorkflowRepository, 'findWorkflowDefinitions').mockResolvedValue([mockRecord]);
    vi.spyOn(approvalWorkflowRepository, 'countWorkflowDefinitions').mockResolvedValue(1);
    vi.spyOn(approvalWorkflowRepository, 'getWorkflowSummaryCounts').mockResolvedValue({
      total: 10,
      active: 8,
      inactive: 2,
    });

    const result = await approvalWorkflowService.listWorkflowDefinitions({
      page: 1,
      limit: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      workflowId: '11111111-1111-1111-1111-111111111111',
      name: 'Risk Plan Approval',
      description: 'Test workflow description',
      entityType: 'risk_treatment_plan',
      isActive: true,
      stepsCount: 3,
      createdBy: {
        userId: '22222222-2222-2222-2222-222222222222',
        name: 'Admin User',
        email: 'admin@securaai.local',
      },
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    });

    expect(result.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });

    expect(result.summary).toEqual({
      total: 10,
      active: 8,
      inactive: 2,
    });
  });

  it('should handle null creator gracefully', async () => {
    const mockRecord: WorkflowDefinitionRecord = {
      workflow_definition_id: '33333333-3333-3333-3333-333333333333',
      name: 'Policy Approval',
      description: null,
      entity_type: 'policy_version',
      is_active: false,
      created_at: new Date('2026-09-01T00:00:00Z'),
      updated_at: new Date('2026-09-02T00:00:00Z'),
      users: null,
      _count: {
        workflow_steps: 0,
      },
    };

    vi.spyOn(approvalWorkflowRepository, 'findWorkflowDefinitions').mockResolvedValue([mockRecord]);
    vi.spyOn(approvalWorkflowRepository, 'countWorkflowDefinitions').mockResolvedValue(1);
    vi.spyOn(approvalWorkflowRepository, 'getWorkflowSummaryCounts').mockResolvedValue({
      total: 1,
      active: 0,
      inactive: 1,
    });

    const result = await approvalWorkflowService.listWorkflowDefinitions({
      page: 1,
      limit: 20,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(result.items[0]?.createdBy).toBeNull();
    expect(result.items[0]?.stepsCount).toBe(0);
    expect(result.summary.inactive).toBe(1);
  });
});

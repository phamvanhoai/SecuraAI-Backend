import type { WorkflowEntityType } from './approval-workflow.constants.js';
import type {
  WorkflowDefinitionListItemDto,
  WorkflowCreatorDto,
} from './dto/workflow-definition-response.dto.js';

export type WorkflowDefinitionRecord = {
  workflow_definition_id: string;
  name: string;
  description: string | null;
  entity_type: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  users: {
    user_id: string;
    full_name: string | null;
    email: string;
  } | null;
  _count: {
    workflow_steps: number;
  };
};

export const approvalWorkflowMapper = {
  toListItemDto(record: WorkflowDefinitionRecord): WorkflowDefinitionListItemDto {
    const creator: WorkflowCreatorDto | null = record.users
      ? {
          userId: record.users.user_id,
          name: record.users.full_name ?? record.users.email,
          email: record.users.email,
        }
      : null;

    return {
      workflowId: record.workflow_definition_id,
      name: record.name,
      description: record.description,
      entityType: record.entity_type as WorkflowEntityType,
      isActive: record.is_active,
      stepsCount: record._count.workflow_steps,
      createdBy: creator,
      createdAt: record.created_at.toISOString(),
      updatedAt: record.updated_at.toISOString(),
    };
  },
};

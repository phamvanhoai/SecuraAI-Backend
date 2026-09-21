import type { WorkflowEntityType } from '../approval-workflow.constants.js';

export type WorkflowCreatorDto = {
  userId: string;
  name: string;
  email: string;
};

export type WorkflowDefinitionListItemDto = {
  workflowId: string;
  name: string;
  description: string | null;
  entityType: WorkflowEntityType;
  isActive: boolean;
  stepsCount: number;
  createdBy: WorkflowCreatorDto | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowSummaryDto = {
  total: number;
  active: number;
  inactive: number;
};

export type WorkflowDefinitionListPaginationDto = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type WorkflowDefinitionListResponseDto = {
  items: WorkflowDefinitionListItemDto[];
  pagination: WorkflowDefinitionListPaginationDto;
  summary: WorkflowSummaryDto;
};

import type { ModuleManifest } from '../module.types.js';
import { approvalWorkflowRouter } from './approval-workflow.routes.js';

export const approvalWorkflowModule: ModuleManifest = {
  name: 'approval-workflow',
  routePrefix: '/workflow-definitions',
  description: 'Reusable workflow definitions, approval actions, and delegation',
  tables: ['workflow_definitions', 'workflow_steps', 'approval_requests', 'approval_actions', 'approval_delegations'],
  capabilities: ['Workflow definition management', 'Multi-step designer', 'Submit/approve/reject', 'Status history', 'Temporary delegation', 'Overdue reminders'],
  router: approvalWorkflowRouter,
};

export * from './approval-workflow.constants.js';
export * from './approval-workflow.repository.js';
export * from './approval-workflow.service.js';
export * from './approval-workflow.controller.js';
export * from './approval-workflow.routes.js';
export * from './approval-workflow.mapper.js';
export * from './dto/index.js';

import type { ModuleManifest } from '../module.types.js';
import { approvalWorkflowRouter } from './approval-workflow.routes.js';

export const approvalWorkflowModule: ModuleManifest = {
  name: 'approval-workflow', routePrefix: '/workflows',
  description: 'Reusable approval definitions, actions and delegation',
  tables: ['workflow_definitions', 'workflow_steps', 'approval_requests', 'approval_actions', 'approval_delegations'],
  capabilities: ['Workflow designer', 'Submit/approve/reject', 'Status history', 'Temporary delegation', 'Overdue reminders'],
  router: approvalWorkflowRouter,
};

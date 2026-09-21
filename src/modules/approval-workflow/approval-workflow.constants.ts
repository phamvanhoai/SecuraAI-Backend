export const WORKFLOW_ENTITY_TYPES = [
  'risk_treatment_plan',
  'policy_version',
  'incident_report',
  'access_request',
] as const;

export type WorkflowEntityType = (typeof WORKFLOW_ENTITY_TYPES)[number];

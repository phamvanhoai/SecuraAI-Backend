import type { ModuleManifest } from '../module.types.js';
import { policyComplianceRouter } from './policy-compliance.routes.js';

export const policyComplianceModule: ModuleManifest = {
  name: 'policy-compliance-control',
  routePrefix: '/compliance',
  description: 'Policies, standards, controls and compliance evidence',
  tables: [
    'policies',
    'policy_versions',
    'policy_departments',
    'policy_acknowledgements',
    'compliance_frameworks',
    'compliance_controls',
    'policy_control_mappings',
    'control_assessments',
    'compliance_evidence',
  ],
  capabilities: [
    'Create policy drafts',
    'Review publishable policy drafts',
    'Publish official policy versions',
    'Update policies and create new versions',
    'Assign published policies to departments',
    'Assess individual security control compliance',
    'Upload and download compliance evidence',
    'Map published policy versions to standard framework controls',
  ],
  router: policyComplianceRouter,
};

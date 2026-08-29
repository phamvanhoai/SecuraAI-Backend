import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const policyComplianceModule: ModuleManifest = {
  name: 'policy-compliance', routePrefix: '/compliance',
  description: 'Policies, standards, controls and compliance evidence',
  tables: ['policies', 'policy_versions', 'policy_departments', 'policy_acknowledgements', 'compliance_frameworks', 'compliance_controls', 'policy_control_mappings', 'control_assessments', 'compliance_evidence'],
  capabilities: ['Policy lifecycle', 'Acknowledgements', 'ISO/NIST control mapping', 'Control assessment and evidence'],
  router: Router(),
};

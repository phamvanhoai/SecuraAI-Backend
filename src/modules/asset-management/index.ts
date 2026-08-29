import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const assetManagementModule: ModuleManifest = {
  name: 'asset-management', routePrefix: '/assets',
  description: 'IT assets and business processes',
  tables: ['assets', 'asset_change_history', 'business_processes'],
  capabilities: ['Asset CRUD/import/export', 'Ownership and criticality', 'Change history', 'Business processes'],
  router: Router(),
};

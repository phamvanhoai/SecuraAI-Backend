import type { ModuleManifest } from '../module.types.js';
import { assetManagementRouter } from './asset-management.routes.js';

export const assetManagementModule: ModuleManifest = {
  name: 'asset-management',
  routePrefix: '/assets',
  description: 'IT assets and business processes',
  tables: ['assets', 'asset_change_history', 'business_processes'],
  capabilities: [
    'Paginated asset list with search, filtering and sorting',
    'Asset CRUD/import/export',
    'Ownership and criticality',
    'Change history',
    'Business processes',
  ],
  router: assetManagementRouter,
};

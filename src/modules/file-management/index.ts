import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const fileManagementModule: ModuleManifest = {
  name: 'file-management', routePrefix: '/files',
  description: 'Shared file storage and bulk import jobs',
  tables: ['files', 'import_jobs'],
  capabilities: ['Upload/download', 'Checksum validation', 'Excel import status'],
  router: Router(),
};

import type { Router } from 'express';

export type ModuleManifest = {
  name: string;
  routePrefix: string;
  description: string;
  tables: readonly string[];
  capabilities: readonly string[];
  router: Router;
};

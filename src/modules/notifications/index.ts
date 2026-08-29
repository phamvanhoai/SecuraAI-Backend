import { Router } from 'express';
import type { ModuleManifest } from '@/modules/module.types.js';

export const notificationsModule: ModuleManifest = {
  name: 'notifications', routePrefix: '/notifications',
  description: 'In-app/email notifications and delivery preferences',
  tables: ['notifications', 'notification_preferences', 'notification_deliveries'],
  capabilities: ['Notification inbox', 'Read state', 'Channel preferences', 'Delivery tracking'],
  router: Router(),
};

import type { ModuleManifest } from '../module.types.js';
import { notificationsRouter } from './notifications.routes.js';
export { notificationsService } from './notifications.service.js';

export const notificationsModule: ModuleManifest = {
  name: 'notification-system-logs',
  routePrefix: '/notifications',
  description: 'In-app/email notifications and delivery preferences',
  tables: ['notifications', 'notification_preferences', 'notification_deliveries'],
  capabilities: ['Notification inbox', 'Read state', 'Channel preferences', 'Delivery tracking'],
  router: notificationsRouter,
};

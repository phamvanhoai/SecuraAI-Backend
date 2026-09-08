import type { ModuleManifest } from '../module.types.js';
import { aiAlertsRouter } from './ai-alerts.routes.js';

export { aiAlertsService } from './ai-alerts.service.js';

export const aiAlertsModule: ModuleManifest = {
  name: 'ai-alerts',
  routePrefix: '/ai-alerts',
  description: 'Pre-trained anomaly models, explainable alerts and feedback',
  tables: [
    'ai_model_versions',
    'ai_alerts',
    'ai_alert_explanations',
    'ai_feedback',
    'asset_alert_thresholds',
  ],
  capabilities: [
    'Pre-trained model and detection-rule configuration',
    'Real-time alerts',
    'Explanations',
    'Analyst feedback',
    'Asset thresholds',
  ],
  router: aiAlertsRouter,
};

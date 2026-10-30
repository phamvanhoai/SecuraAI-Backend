// Local development runs API and background processing under one watch command.
// Production/Docker still use server.ts and worker.ts as separate entry points.
import './server.js';
import { env } from './config/env.js';

if (env.NODE_ENV === 'development' && env.DETECTION_PIPELINE_ENABLED) {
  void import('./worker.js');
}

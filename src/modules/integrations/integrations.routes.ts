import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import * as controller from './integrations.controller.js';
import {
  createIntegrationSchema,
  queryIntegrationsSchema,
  testConnectionSchema,
  updateIntegrationSchema,
  createSyncScheduleSchema,
  updateSyncScheduleSchema,
  querySyncJobsSchema,
  triggerSyncSchema,
  queryIntegrationLogsSchema,
} from './dto/index.js';

export const integrationsRouter = Router();

const idParamSchema = z.object({
  id: z.string().uuid('Invalid integration ID format'),
});

const scheduleParamSchema = z.object({
  id: z.string().uuid('Invalid integration ID format'),
  scheduleId: z.string().uuid('Invalid schedule ID format'),
});

const jobParamSchema = z.object({
  id: z.string().uuid('Invalid integration ID format'),
  jobId: z.string().uuid('Invalid job ID format'),
});

const testConnectionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many connection tests requested. Please wait before retrying.',
    },
  },
});

const manualSyncLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many synchronization requests. Please wait before retrying.',
    },
  },
});

// -------------------------------------------------------------
// Integration Core Routes
// -------------------------------------------------------------
integrationsRouter.post(
  '/',
  authenticate,
  authorize('integrations.create'),
  validate({ body: createIntegrationSchema }),
  asyncHandler((req, res) => controller.createIntegration(req, res)),
);

integrationsRouter.get(
  '/',
  authenticate,
  authorize('integrations.read'),
  validate({ query: queryIntegrationsSchema }),
  asyncHandler((req, res) => controller.listIntegrations(req, res)),
);

integrationsRouter.get(
  '/:id',
  authenticate,
  authorize('integrations.read'),
  validate({ params: idParamSchema }),
  asyncHandler((req, res) => controller.getIntegrationById(req, res)),
);

integrationsRouter.patch(
  '/:id',
  authenticate,
  authorize('integrations.update'),
  validate({ params: idParamSchema, body: updateIntegrationSchema }),
  asyncHandler((req, res) => controller.updateIntegration(req, res)),
);

integrationsRouter.post(
  '/:id/test-connection',
  authenticate,
  authorize('integrations.connect'),
  testConnectionLimiter,
  validate({ params: idParamSchema, body: testConnectionSchema }),
  asyncHandler((req, res) => controller.testConnection(req, res)),
);

// -------------------------------------------------------------
// Sync Schedules Routes
// -------------------------------------------------------------
integrationsRouter.post(
  '/:id/schedules',
  authenticate,
  authorize('integrations.update'),
  validate({ params: idParamSchema, body: createSyncScheduleSchema }),
  asyncHandler((req, res) => controller.createSyncSchedule(req, res)),
);

integrationsRouter.get(
  '/:id/schedules',
  authenticate,
  authorize('integrations.read'),
  validate({ params: idParamSchema }),
  asyncHandler((req, res) => controller.listSyncSchedules(req, res)),
);

integrationsRouter.get(
  '/:id/schedules/:scheduleId',
  authenticate,
  authorize('integrations.read'),
  validate({ params: scheduleParamSchema }),
  asyncHandler((req, res) => controller.getSyncScheduleById(req, res)),
);

integrationsRouter.patch(
  '/:id/schedules/:scheduleId',
  authenticate,
  authorize('integrations.update'),
  validate({ params: scheduleParamSchema, body: updateSyncScheduleSchema }),
  asyncHandler((req, res) => controller.updateSyncSchedule(req, res)),
);

integrationsRouter.delete(
  '/:id/schedules/:scheduleId',
  authenticate,
  authorize('integrations.update'),
  validate({ params: scheduleParamSchema }),
  asyncHandler((req, res) => controller.deleteSyncSchedule(req, res)),
);

// -------------------------------------------------------------
// Sync Execution, Jobs & Logs Routes
// -------------------------------------------------------------
integrationsRouter.post(
  '/:id/sync',
  authenticate,
  authorize('integrations.connect'),
  manualSyncLimiter,
  validate({ params: idParamSchema, body: triggerSyncSchema }),
  asyncHandler((req, res) => controller.triggerSync(req, res)),
);

integrationsRouter.get(
  '/:id/sync-jobs',
  authenticate,
  authorize('integrations.read'),
  validate({ params: idParamSchema, query: querySyncJobsSchema }),
  asyncHandler((req, res) => controller.listSyncJobs(req, res)),
);

integrationsRouter.get(
  '/:id/sync-jobs/:jobId',
  authenticate,
  authorize('integrations.read'),
  validate({ params: jobParamSchema }),
  asyncHandler((req, res) => controller.getSyncJobById(req, res)),
);

integrationsRouter.get(
  '/:id/logs',
  authenticate,
  authorize('integrations.read'),
  validate({ params: idParamSchema, query: queryIntegrationLogsSchema }),
  asyncHandler((req, res) => controller.listIntegrationLogs(req, res)),
);

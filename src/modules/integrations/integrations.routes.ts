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
} from './dto/index.js';

export const integrationsRouter = Router();

const idParamSchema = z.object({
  id: z.string().uuid('Invalid integration ID format'),
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

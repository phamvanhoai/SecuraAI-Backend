import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createMfaRecoveryRequestBodySchema,
  decideMfaRecoveryRequestBodySchema,
  listMfaRecoveryRequestsQuerySchema,
  mfaRecoveryRequestParamsSchema,
} from './dto/mfa-recovery.dto.js';
import * as controller from './mfa-recovery.controller.js';

const recoveryRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many recovery requests' } },
});

export const mfaRecoveryPublicRouter = Router();
mfaRecoveryPublicRouter.post(
  '/',
  recoveryRequestLimiter,
  validate({ body: createMfaRecoveryRequestBodySchema }),
  asyncHandler(controller.createMfaRecoveryRequest),
);

export const mfaRecoveryAdminRouter = Router();
mfaRecoveryAdminRouter.use(authenticate, authorize('mfa-recovery.manage'));
mfaRecoveryAdminRouter.get(
  '/',
  validate({ query: listMfaRecoveryRequestsQuerySchema }),
  asyncHandler(controller.listMfaRecoveryRequests),
);
mfaRecoveryAdminRouter.post(
  '/:requestId/approve',
  validate({ params: mfaRecoveryRequestParamsSchema, body: decideMfaRecoveryRequestBodySchema }),
  asyncHandler(controller.approveMfaRecoveryRequest),
);
mfaRecoveryAdminRouter.post(
  '/:requestId/reject',
  validate({ params: mfaRecoveryRequestParamsSchema, body: decideMfaRecoveryRequestBodySchema }),
  asyncHandler(controller.rejectMfaRecoveryRequest),
);

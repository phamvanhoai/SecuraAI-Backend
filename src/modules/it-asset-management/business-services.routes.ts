import { Router } from 'express';
import { updateBusinessServiceSchema } from './dto/update-business-service.dto.js';
import { deactivateBusinessServiceSchema } from './dto/deactivate-business-service.dto.js';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createBusinessService,
  checkBusinessServiceDeactivation,
  deactivateBusinessService,
  updateBusinessService,
  getBusinessServiceOwners,
  getBusinessService,
  listBusinessServiceAssets,
  listBusinessServices,
} from './business-services.controller.js';
import {
  createBusinessServiceSchema,
  businessServiceOwnerQuerySchema,
} from './dto/create-business-service.dto.js';
import {
  businessServiceParamsSchema,
  listBusinessServicesQuerySchema,
  servicePageQuerySchema,
} from './dto/list-business-services.dto.js';

export const businessServicesRouter = Router();
businessServicesRouter.use(authenticate);
businessServicesRouter.get(
  '/:serviceId/deactivation-check',
  validate({ params: businessServiceParamsSchema }),
  asyncHandler(checkBusinessServiceDeactivation),
);
businessServicesRouter.post(
  '/:serviceId/deactivate',
  validate({ params: businessServiceParamsSchema, body: deactivateBusinessServiceSchema }),
  asyncHandler(deactivateBusinessService),
);
businessServicesRouter.patch(
  '/:serviceId',
  validate({ params: businessServiceParamsSchema, body: updateBusinessServiceSchema }),
  asyncHandler(updateBusinessService),
);
businessServicesRouter.post(
  '/',
  validate({ body: createBusinessServiceSchema }),
  asyncHandler(createBusinessService),
);
businessServicesRouter.get(
  '/owner-options',
  validate({ query: businessServiceOwnerQuerySchema }),
  asyncHandler(getBusinessServiceOwners),
);
businessServicesRouter.get(
  '/',
  validate({ query: listBusinessServicesQuerySchema }),
  asyncHandler(listBusinessServices),
);
businessServicesRouter.get(
  '/:serviceId',
  validate({ params: businessServiceParamsSchema }),
  asyncHandler(getBusinessService),
);
businessServicesRouter.get(
  '/:serviceId/assets',
  validate({ params: businessServiceParamsSchema, query: servicePageQuerySchema }),
  asyncHandler(listBusinessServiceAssets),
);

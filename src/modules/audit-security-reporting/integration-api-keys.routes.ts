import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  integrationApiKeyParamsSchema,
  listIntegrationApiKeysQuerySchema,
} from './dto/list-integration-api-keys.dto.js';
import { createIntegrationApiKeySchema } from './dto/create-integration-api-key.dto.js';
import {
  getIntegrationApiKeyDetailParamsSchema,
  getIntegrationSourceApiKeyDetailParamsSchema,
} from './dto/get-integration-api-key-detail.dto.js';
import {
  createIntegrationApiKey,
  createIntegrationApiKeyBySource,
  getIntegrationApiKeyDetail,
  getIntegrationApiKeyDetailBySource,
  listIntegrationApiKeys,
  listIntegrationApiKeysBySource,
} from './integration-api-keys.controller.js';

export const integrationApiKeysRouter = Router();

integrationApiKeysRouter.get(
  '/',
  authenticate,
  validate({ query: listIntegrationApiKeysQuerySchema }),
  asyncHandler(listIntegrationApiKeys),
);

integrationApiKeysRouter.post(
  '/',
  authenticate,
  validate({ body: createIntegrationApiKeySchema }),
  asyncHandler(createIntegrationApiKey),
);

integrationApiKeysRouter.get(
  '/:keyId',
  authenticate,
  validate({ params: getIntegrationApiKeyDetailParamsSchema }),
  asyncHandler(getIntegrationApiKeyDetail),
);

export const integrationSourceApiKeysRouter = Router({ mergeParams: true });

integrationSourceApiKeysRouter.get(
  '/:id/api-keys',
  authenticate,
  validate({
    params: integrationApiKeyParamsSchema,
    query: listIntegrationApiKeysQuerySchema,
  }),
  asyncHandler(listIntegrationApiKeysBySource),
);

integrationSourceApiKeysRouter.get(
  '/:id/api-keys/:keyId',
  authenticate,
  validate({ params: getIntegrationSourceApiKeyDetailParamsSchema }),
  asyncHandler(getIntegrationApiKeyDetailBySource),
);

integrationSourceApiKeysRouter.post(
  '/:id/api-keys',
  authenticate,
  validate({
    params: integrationApiKeyParamsSchema,
    body: createIntegrationApiKeySchema,
  }),
  asyncHandler(createIntegrationApiKeyBySource),
);

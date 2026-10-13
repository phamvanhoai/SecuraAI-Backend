import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { integrationApiKeysService } from './integration-api-keys.service.js';
import {
  integrationApiKeyParamsSchema,
  listIntegrationApiKeysQuerySchema,
} from './dto/list-integration-api-keys.dto.js';
import { createIntegrationApiKeySchema } from './dto/create-integration-api-key.dto.js';
import {
  getIntegrationApiKeyDetailParamsSchema,
  getIntegrationSourceApiKeyDetailParamsSchema,
} from './dto/get-integration-api-key-detail.dto.js';
import { updateIntegrationApiKeySchema } from './dto/update-integration-api-key.dto.js';
import { rotateIntegrationApiKeySchema } from './dto/rotate-integration-api-key.dto.js';

function authenticatedUserId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return value;
}

export async function listIntegrationApiKeys(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const query = listIntegrationApiKeysQuerySchema.parse(req.query);
  const result = await integrationApiKeysService.listApiKeys(userId, query);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function listIntegrationApiKeysBySource(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = integrationApiKeyParamsSchema.parse(req.params);
  const query = listIntegrationApiKeysQuerySchema.parse(req.query);
  const items = await integrationApiKeysService.listApiKeysForIntegration(
    userId,
    params.id,
    query,
  );

  res.status(200).json({
    success: true,
    data: items,
  });
}

export async function createIntegrationApiKey(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const input = createIntegrationApiKeySchema.parse(req.body);
  const result = await integrationApiKeysService.createApiKey(userId, input);

  res.status(201).json({
    success: true,
    data: result,
  });
}

export async function createIntegrationApiKeyBySource(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = integrationApiKeyParamsSchema.parse(req.params);
  const input = createIntegrationApiKeySchema.parse(req.body);
  const result = await integrationApiKeysService.createApiKey(userId, input, params.id);

  res.status(201).json({
    success: true,
    data: result,
  });
}

export async function getIntegrationApiKeyDetail(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getIntegrationApiKeyDetailParamsSchema.parse(req.params);
  const result = await integrationApiKeysService.getApiKeyDetail(userId, params.keyId);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function getIntegrationApiKeyDetailBySource(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getIntegrationSourceApiKeyDetailParamsSchema.parse(req.params);
  const result = await integrationApiKeysService.getApiKeyDetail(userId, params.keyId, params.id);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function updateIntegrationApiKey(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getIntegrationApiKeyDetailParamsSchema.parse(req.params);
  const input = updateIntegrationApiKeySchema.parse(req.body);
  const result = await integrationApiKeysService.updateApiKey(userId, params.keyId, input);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function updateIntegrationApiKeyBySource(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getIntegrationSourceApiKeyDetailParamsSchema.parse(req.params);
  const input = updateIntegrationApiKeySchema.parse(req.body);
  const result = await integrationApiKeysService.updateApiKey(
    userId,
    params.keyId,
    input,
    params.id,
  );

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function rotateIntegrationApiKey(req: Request, res: Response): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getIntegrationApiKeyDetailParamsSchema.parse(req.params);
  const input = rotateIntegrationApiKeySchema.parse(req.body);
  const result = await integrationApiKeysService.rotateApiKey(userId, params.keyId, input);

  res.status(200).json({
    success: true,
    data: result,
  });
}

export async function rotateIntegrationApiKeyBySource(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = authenticatedUserId(res.locals.authenticatedUserId);
  const params = getIntegrationSourceApiKeyDetailParamsSchema.parse(req.params);
  const input = rotateIntegrationApiKeySchema.parse(req.body);
  const result = await integrationApiKeysService.rotateApiKey(
    userId,
    params.keyId,
    input,
    params.id,
  );

  res.status(200).json({
    success: true,
    data: result,
  });
}

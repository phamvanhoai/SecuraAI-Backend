import type { Request, Response } from 'express';
import { integrationsService } from './integrations.service.js';
import type {
  CreateIntegrationDto,
  QueryIntegrationsDto,
  TestConnectionDto,
  UpdateIntegrationDto,
} from './dto/index.js';

export async function createIntegration(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateIntegrationDto;
  const userId = req.auth?.userId;
  const result = await integrationsService.createIntegration(body, userId);
  res.status(201).json({ success: true, data: result });
}

export async function listIntegrations(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as QueryIntegrationsDto;
  const result = await integrationsService.listIntegrations(query);
  res.status(200).json({ success: true, data: result });
}

export async function getIntegrationById(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const result = await integrationsService.getIntegrationById(id as string);
  res.status(200).json({ success: true, data: result });
}

export async function updateIntegration(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as UpdateIntegrationDto;
  const result = await integrationsService.updateIntegration(id as string, body);
  res.status(200).json({ success: true, data: result });
}

export async function testConnection(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as TestConnectionDto;
  const result = await integrationsService.testConnection(id as string, body);
  res.status(200).json({ success: true, data: result });
}

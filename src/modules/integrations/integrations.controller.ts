import type { Request, Response } from 'express';
import { integrationsService } from './integrations.service.js';
import type {
  CreateIntegrationDto,
  QueryIntegrationsDto,
  TestConnectionDto,
  UpdateIntegrationDto,
  CreateSyncScheduleDto,
  UpdateSyncScheduleDto,
  QuerySyncJobsDto,
  TriggerSyncDto,
  QueryIntegrationLogsDto,
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

// -------------------------------------------------------------
// Sync Schedules Controllers
// -------------------------------------------------------------
export async function createSyncSchedule(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body = req.body as CreateSyncScheduleDto;
  const result = await integrationsService.createSyncSchedule(id as string, body);
  res.status(201).json({ success: true, data: result });
}

export async function listSyncSchedules(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const filter =
    req.query['isActive'] !== undefined ? { isActive: req.query['isActive'] === 'true' } : undefined;
  const result = await integrationsService.getSyncSchedules(id as string, filter);
  res.status(200).json({ success: true, data: result });
}

export async function getSyncScheduleById(req: Request, res: Response): Promise<void> {
  const { id, scheduleId } = req.params;
  const result = await integrationsService.getSyncScheduleById(id as string, scheduleId as string);
  res.status(200).json({ success: true, data: result });
}

export async function updateSyncSchedule(req: Request, res: Response): Promise<void> {
  const { id, scheduleId } = req.params;
  const body = req.body as UpdateSyncScheduleDto;
  const result = await integrationsService.updateSyncSchedule(id as string, scheduleId as string, body);
  res.status(200).json({ success: true, data: result });
}

export async function deleteSyncSchedule(req: Request, res: Response): Promise<void> {
  const { id, scheduleId } = req.params;
  await integrationsService.deleteSyncSchedule(id as string, scheduleId as string);
  res.status(204).send();
}

// -------------------------------------------------------------
// Sync Execution, Jobs & Logs Controllers
// -------------------------------------------------------------
export async function triggerSync(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const body = (req.body ?? {}) as TriggerSyncDto;
  const result = await integrationsService.triggerSyncJob(id as string, {
    syncScheduleId: body.syncScheduleId,
  });
  res.status(200).json({ success: true, data: result });
}

export async function listSyncJobs(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const query = req.query as unknown as QuerySyncJobsDto;
  const result = await integrationsService.listSyncJobs(id as string, query);
  res.status(200).json({ success: true, data: result });
}

export async function getSyncJobById(req: Request, res: Response): Promise<void> {
  const { id, jobId } = req.params;
  const result = await integrationsService.getSyncJobById(id as string, jobId as string);
  res.status(200).json({ success: true, data: result });
}

export async function listIntegrationLogs(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const query = req.query as unknown as QueryIntegrationLogsDto;
  const result = await integrationsService.listIntegrationLogs(id as string, query);
  res.status(200).json({ success: true, data: result });
}

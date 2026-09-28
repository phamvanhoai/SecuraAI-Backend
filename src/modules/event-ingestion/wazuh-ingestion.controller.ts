import type { Request, Response } from 'express';
import { wazuhIngestionService } from './wazuh-ingestion.service.js';
import type { WazuhEventIngestInput } from './dto/wazuh-event-ingest.dto.js';

export const wazuhIngestionController = {
  async handleIngestEvent(req: Request, res: Response): Promise<void> {
    const rawAuth =
      (req.headers['x-securaai-ingest-key'] as string | undefined) ??
      (req.headers['authorization'] as string | undefined);

    const body = req.body as WazuhEventIngestInput;
    const result = await wazuhIngestionService.ingestNormalizedEvent(rawAuth, body);

    res.status(201).json({
      success: true,
      data: result,
    });
  },
};

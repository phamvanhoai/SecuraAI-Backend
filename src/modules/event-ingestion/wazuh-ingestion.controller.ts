import type { Request, Response } from 'express';
import { wazuhIngestionService } from './wazuh-ingestion.service.js';
import type { WazuhEventIngestInput } from './dto/wazuh-event-ingest.dto.js';

export const wazuhIngestionController = {
  handleIngestEvent: async (req: Request, res: Response): Promise<void> => {
    const ingestKey = req.headers['x-securaai-ingest-key'];
    const rawAuth =
      (Array.isArray(ingestKey) ? undefined : ingestKey) ?? req.headers['authorization'];

    const body = req.body as WazuhEventIngestInput;
    const result = await wazuhIngestionService.ingestNormalizedEvent(rawAuth, body);

    res.status(201).json({
      success: true,
      data: result,
    });
  },
};

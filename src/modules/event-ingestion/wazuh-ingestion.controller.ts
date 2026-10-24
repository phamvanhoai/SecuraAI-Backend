import type { RequestHandler } from 'express';
import { wazuhIngestionService } from './wazuh-ingestion.service.js';
import type { WazuhEventIngestInput } from './dto/wazuh-event-ingest.dto.js';

export const handleIngestEvent: RequestHandler = async (req, res) => {
  const rawAuth =
    (typeof req.headers['x-securaai-ingest-key'] === 'string'
      ? req.headers['x-securaai-ingest-key']
      : undefined) ??
    (typeof req.headers['authorization'] === 'string'
      ? req.headers['authorization']
      : undefined);

  const isAlreadyAuthenticated = Boolean(res.locals.apiKey);
  const body = req.body as WazuhEventIngestInput;
  const result = await wazuhIngestionService.ingestNormalizedEvent(
    rawAuth,
    body,
    isAlreadyAuthenticated,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
};

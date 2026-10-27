import type { RequestHandler } from 'express';
import type { AuthenticatedApiKeyContext } from '../../common/middleware/authenticate-api-key.js';
import { wazuhIngestionService } from './wazuh-ingestion.service.js';
import type { WazuhEventIngestInput } from './dto/wazuh-event-ingest.dto.js';

export const handleIngestEvent: RequestHandler = async (req, res) => {
  const apiKey = res.locals.apiKey as AuthenticatedApiKeyContext | undefined;
  const body = req.body as WazuhEventIngestInput;
  const result = await wazuhIngestionService.ingestNormalizedEvent(
    apiKey?.eventSourceId ?? null,
    body,
  );

  res.status(201).json({
    success: true,
    data: result,
  });
};

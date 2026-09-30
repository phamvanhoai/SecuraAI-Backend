import { Router } from 'express';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { wazuhEventIngestSchema } from './dto/wazuh-event-ingest.dto.js';
import { handleIngestEvent } from './wazuh-ingestion.controller.js';

export const wazuhIngestionRouter = Router();

// Endpoint for receiving normalized events from Wazuh Edge Normalizer: POST /api/v1/integrations/wazuh/events
wazuhIngestionRouter.post(
  '/events',
  validate({ body: wazuhEventIngestSchema }),
  asyncHandler(handleIngestEvent),
);

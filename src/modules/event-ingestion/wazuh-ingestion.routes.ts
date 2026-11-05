import { Router } from 'express';
import {
  authenticateApiKey,
  requireApiKeyScope,
} from '../../common/middleware/authenticate-api-key.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { wazuhIngestSchema } from './dto/wazuh-event-ingest.dto.js';
import { handleIngestEvent } from './wazuh-ingestion.controller.js';

export const wazuhIngestionRouter = Router();

// Accepts either native Wazuh alerts or already-normalized SecuraAI events.
wazuhIngestionRouter.post(
  '/events',
  authenticateApiKey,
  requireApiKeyScope('events:ingest'),
  validate({ body: wazuhIngestSchema }),
  asyncHandler(handleIngestEvent),
);

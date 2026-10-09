import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.js';
import { timingSafeEqual } from 'node:crypto';
import type {
  WazuhEventIngestInput,
  WazuhIngestResponseDto,
} from './dto/wazuh-event-ingest.dto.js';
import { wazuhIngestionRepository } from './wazuh-ingestion.repository.js';

function verifyIngestToken(token?: string): void {
  const configuredToken = env.WAZUH_INGEST_TOKEN;
  if (!configuredToken) {
    throw new AppError(503, 'WAZUH_INGESTION_NOT_CONFIGURED', 'Wazuh ingestion is not configured');
  }
  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing SecuraAI ingestion token');
  }

  const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
  const supplied = Buffer.from(cleanToken);
  const expected = Buffer.from(configuredToken);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new AppError(403, 'FORBIDDEN', 'Invalid SecuraAI ingestion token');
  }
}

export const wazuhIngestionService = {
  async ingestNormalizedEvent(
    token: string | undefined,
    input: WazuhEventIngestInput,
  ): Promise<WazuhIngestResponseDto> {
    // 1. Verify Ingest Token
    verifyIngestToken(token);

    // 2. Find or Provision Event Source Record
    const source = await wazuhIngestionRepository.ensureDefaultWazuhSource();

    // 3. Save Normalized Event
    const saved = await wazuhIngestionRepository.saveNormalizedEvent(source.id, input);

    return {
      eventId: saved.id,
      externalEventId: saved.external_event_id,
      eventFamily: saved.event_family,
      eventType: saved.event_type,
      status: 'INGESTED',
      ingestedAt: saved.ingested_at,
    };
  },
};

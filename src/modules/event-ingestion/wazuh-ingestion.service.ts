import { AppError } from '../../common/errors/app-error.js';
import type {
  WazuhEventIngestInput,
  WazuhIngestResponseDto,
} from './dto/wazuh-event-ingest.dto.js';
import { wazuhIngestionRepository } from './wazuh-ingestion.repository.js';

function verifyIngestToken(token?: string): void {
  const configuredToken = process.env['SECURAAI_INGEST_TOKEN'] ?? process.env['WAZUH_INGEST_TOKEN'];

  // If a token is configured in environment, verify it
  if (configuredToken && configuredToken !== 'YOUR_SECURA_AI_INGEST_TOKEN') {
    if (!token) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing SecuraAI Ingestion Token');
    }
    // Clean bearer prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    if (cleanToken !== configuredToken) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid SecuraAI Ingestion Token');
    }
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
      eventFamily: saved.event_family as 'AUTHENTICATION' | 'VPN_SSO' | 'APPLICATION_ACCESS',
      eventType: saved.event_type,
      status: 'INGESTED',
      ingestedAt: saved.ingested_at,
    };
  },
};

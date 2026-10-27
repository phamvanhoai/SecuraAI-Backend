import { AppError } from '../../common/errors/app-error.js';
import type {
  WazuhEventIngestInput,
  WazuhIngestResponseDto,
} from './dto/wazuh-event-ingest.dto.js';
import { wazuhIngestionRepository } from './wazuh-ingestion.repository.js';
import { requestAutomatedDetection } from '../ai-anomaly-detection-alerts/automated-detection.worker.js';

type ResolvedSource = { id: string; status: string };

async function resolveTargetSource(apiKeyEventSourceId: string | null): Promise<ResolvedSource> {
  if (apiKeyEventSourceId) {
    // The API key is bound to a specific source: events can only be written to that source.
    const bound = await wazuhIngestionRepository.findSourceById(apiKeyEventSourceId);
    if (!bound) {
      throw new AppError(403, 'FORBIDDEN', 'Event source linked to this API key no longer exists');
    }
    if (bound.source_type !== 'WAZUH') {
      throw new AppError(403, 'FORBIDDEN', 'API key is linked to a non-Wazuh event source');
    }
    return bound;
  }

  // Static system token or an unbound key: fall back to the default Wazuh source.
  return wazuhIngestionRepository.ensureDefaultWazuhSource();
}

export const wazuhIngestionService = {
  async ingestNormalizedEvent(
    apiKeyEventSourceId: string | null,
    input: WazuhEventIngestInput,
  ): Promise<WazuhIngestResponseDto> {
    // Caller has already been authenticated and scope-checked by authenticateApiKey middleware.
    const source = await resolveTargetSource(apiKeyEventSourceId);

    if (source.status !== 'ACTIVE') {
      throw new AppError(403, 'FORBIDDEN', 'Event source is inactive or disabled');
    }

    const saved = await wazuhIngestionRepository.saveNormalizedEvent(source.id, input);
    requestAutomatedDetection();

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

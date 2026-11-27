/**
 * Layer: Service / Business Logic (Event Ingestion - Event Sources)
 * Purpose: Enforces domain rules, service-level RBAC guards, pagination math, and DB-to-DTO response mapping.
 * Flow: Controller -> Service -> Repository -> Prisma
 */
import { AppError } from '../../common/errors/app-error.js';
import type { CreateEventSourceInput, EventSourceResponseDto } from './dto/create-event-source.dto.js';
import type {
  ListEventSourcesQuery,
  PaginatedEventSourcesResponseDto,
} from './dto/list-event-sources.dto.js';
import type { EventSourceDetailResponseDto } from './dto/get-event-source-detail.dto.js';
import type { UpdateEventSourceInput } from './dto/update-event-source.dto.js';
import type {
  TestEventSourceConnectionInput,
  TestExistingEventSourceConnectionInput,
  TestEventSourceConnectionResponseDto,
} from './dto/test-event-source-connection.dto.js';
import { wazuhConnectionTester } from './connectors/wazuh-connection-tester.js';
import {
  eventSourcesRepository,
  type EventSourceRecord,
} from './event-sources.repository.js';

/**
 * Maps a snake_case Prisma event_sources record to the public camelCase API DTO
 * and flattens the joined event_source_families rows into a plain string array.
 */
function toEventSourceResponse(record: EventSourceRecord): EventSourceResponseDto {
  return {
    id: record.id,
    name: record.name,
    sourceType: record.source_type,
    endpoint: record.endpoint,
    ingestionMethod: record.ingestion_method,
    authenticationType: record.authentication_type,
    status: record.status,
    description: record.description,
    eventFamilies: record.event_source_families.map((f) => f.event_family),
    createdBy: record.created_by,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/**
 * Defense-in-depth authorization guard at the service layer.
 * Ensures the caller is an ACTIVE ADMIN or SECURITY_OFFICER even if invoked outside HTTP middleware.
 */
async function requireAuthorizedActor(userId: string): Promise<{ id: string; role: string; status: string }> {
  const actor = await eventSourcesRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER') {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions to access event sources');
  }
  return actor;
}

export const eventSourcesService = {
  /** Registers a new event source after verifying actor permissions and name uniqueness. */
  async registerEventSource(
    userId: string,
    input: CreateEventSourceInput,
  ): Promise<EventSourceResponseDto> {
    await requireAuthorizedActor(userId);

    const duplicate = await eventSourcesRepository.findByName(input.name);
    if (duplicate) {
      throw new AppError(409, 'CONFLICT', 'An event source with this name already exists');
    }

    const created = await eventSourcesRepository.create({
      name: input.name,
      sourceType: input.sourceType,
      endpoint: input.endpoint,
      ingestionMethod: input.ingestionMethod,
      authenticationType: input.authenticationType,
      status: input.status,
      description: input.description,
      createdBy: userId,
      eventFamilies: input.eventFamilies,
    });

    return toEventSourceResponse(created);
  },

  /**
   * Returns a paginated, filtered, and sorted list of configured event sources.
   * Runs the page query and total count in parallel to minimize database round-trip latency.
   */
  async listEventSources(
    userId: string,
    query: ListEventSourcesQuery,
  ): Promise<PaginatedEventSourcesResponseDto> {
    await requireAuthorizedActor(userId);

    const { page, limit, q, sourceType, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    // Fetch matching page items and total count concurrently using the same filter criteria
    const [records, total] = await Promise.all([
      eventSourcesRepository.findMany({
        skip,
        take: limit,
        q,
        sourceType,
        status,
        sortBy,
        sortOrder,
      }),
      eventSourcesRepository.count({
        q,
        sourceType,
        status,
      }),
    ]);

    // Guarantee totalPages is at least 1 so empty result sets still have a valid pagination ceiling
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: records.map(toEventSourceResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  },

  /** Fetches detailed information for a single event source including creator, masked API keys, and ingestion metrics. */
  async getEventSourceDetail(
    userId: string,
    id: string,
  ): Promise<EventSourceDetailResponseDto> {
    await requireAuthorizedActor(userId);

    const record = await eventSourcesRepository.findById(id);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', 'Event source not found');
    }

    const baseResponse = toEventSourceResponse(record);
    const lastBatch = record.event_ingestion_batches[0];

    return {
      ...baseResponse,
      creator: record.users
        ? {
            id: record.users.id,
            email: record.users.email,
            fullName: record.users.full_name,
          }
        : null,
      apiKeys: record.integration_api_keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.key_prefix,
        maskedKey: `${key.key_prefix}...****`,
        status: key.status,
        expiresAt: key.expires_at,
        lastUsedAt: key.last_used_at,
        lastUsedIp: key.last_used_ip,
        createdAt: key.created_at,
      })),
      stats: {
        totalIngestedEvents: record._count.normalized_events,
        totalBatches: record._count.event_ingestion_batches,
        lastIngestedAt: lastBatch ? lastBatch.created_at : null,
      },
    };
  },

  /** Updates an event source; enforces ADMIN-only status toggles, unique name checks, and API endpoint requirements. */
  async updateEventSource(
    userId: string,
    id: string,
    input: UpdateEventSourceInput,
  ): Promise<EventSourceResponseDto> {
    const actor = await requireAuthorizedActor(userId);

    const existing = await eventSourcesRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Event source not found');
    }

    if (input.status !== undefined && input.status !== existing.status && actor.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only administrators can enable or disable event sources');
    }

    if (input.name !== undefined && input.name !== existing.name) {
      const duplicate = await eventSourcesRepository.findByName(input.name);
      if (duplicate && duplicate.id !== id) {
        throw new AppError(409, 'CONFLICT', 'An event source with this name already exists');
      }
    }

    const effectiveMethod = input.ingestionMethod ?? existing.ingestion_method;
    const effectiveEndpoint =
      input.endpoint !== undefined ? input.endpoint : existing.endpoint;

    if (effectiveMethod === 'API' && (!effectiveEndpoint || effectiveEndpoint.trim().length === 0)) {
      throw new AppError(400, 'BAD_REQUEST', 'Endpoint is required when ingestion method is API');
    }

    const updated = await eventSourcesRepository.update(id, input);
    return toEventSourceResponse(updated);
  },

  /** Runs a live connectivity diagnostic against an unsaved event source endpoint. */
  async testConnection(
    userId: string,
    input: TestEventSourceConnectionInput,
  ): Promise<TestEventSourceConnectionResponseDto> {
    await requireAuthorizedActor(userId);
    return wazuhConnectionTester.testConnection(input);
  },

  /** Runs a live connectivity diagnostic using the stored endpoint of an existing event source. */
  async testConnectionById(
    userId: string,
    id: string,
    input: TestExistingEventSourceConnectionInput,
  ): Promise<TestEventSourceConnectionResponseDto> {
    await requireAuthorizedActor(userId);

    const existing = await eventSourcesRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Event source not found');
    }

    if (!existing.endpoint) {
      throw new AppError(400, 'BAD_REQUEST', 'Event source does not have an endpoint configured');
    }

    return wazuhConnectionTester.testConnection({
      endpoint: existing.endpoint,
      username: input.username,
      password: input.password,
      verifySsl: input.verifySsl ?? true,
      timeoutMs: input.timeoutMs,
    });
  },
};

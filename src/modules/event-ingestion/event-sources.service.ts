import { AppError } from '../../common/errors/app-error.js';
import type { CreateEventSourceInput, EventSourceResponseDto } from './dto/create-event-source.dto.js';
import type {
  ListEventSourcesQuery,
  PaginatedEventSourcesResponseDto,
} from './dto/list-event-sources.dto.js';
import type { EventSourceDetailResponseDto } from './dto/get-event-source-detail.dto.js';
import type { UpdateEventSourceInput } from './dto/update-event-source.dto.js';
import {
  eventSourcesRepository,
  type EventSourceRecord,
} from './event-sources.repository.js';

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

async function requireAuthorizedActor(userId: string): Promise<void> {
  const actor = await eventSourcesRepository.findActor(userId);
  if (!actor || actor.status !== 'ACTIVE') {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  if (actor.role !== 'ADMIN' && actor.role !== 'SECURITY_OFFICER') {
    throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions to access event sources');
  }
}

export const eventSourcesService = {
  async registerEventSource(
    userId: string,
    input: CreateEventSourceInput,
  ): Promise<EventSourceResponseDto> {
    await requireAuthorizedActor(userId);

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

  async listEventSources(
    userId: string,
    query: ListEventSourcesQuery,
  ): Promise<PaginatedEventSourcesResponseDto> {
    await requireAuthorizedActor(userId);

    const { page, limit, q, sourceType, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

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

  async updateEventSource(
    userId: string,
    id: string,
    input: UpdateEventSourceInput,
  ): Promise<EventSourceResponseDto> {
    await requireAuthorizedActor(userId);

    const existing = await eventSourcesRepository.findById(id);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Event source not found');
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
};

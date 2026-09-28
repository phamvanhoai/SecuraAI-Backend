import { AppError } from '../../common/errors/app-error.js';
import type { CreateEventSourceInput, EventSourceResponseDto } from './dto/create-event-source.dto.js';
import type {
  ListEventSourcesQuery,
  PaginatedEventSourcesResponseDto,
} from './dto/list-event-sources.dto.js';
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
};

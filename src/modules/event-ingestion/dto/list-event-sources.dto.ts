/**
 * Layer: DTO / Validation Contract (Event Ingestion - Event Sources)
 * Purpose: Defines Zod validation rules for list query params and the paginated response contract.
 * Flow: Route (validate) -> Controller (parse) -> Service -> HTTP Response
 */
import { z } from 'zod';
import { EVENT_SOURCE_STATUSES, type EventSourceResponseDto } from './create-event-source.dto.js';

/**
 * Query validation schema for GET /api/v1/event-sources.
 * Coerces pagination strings from URL query params into integers, applies defaults,
 * restricts sortable columns to an allow-list, and rejects unknown query parameters (.strict()).
 */
export const listEventSourcesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // Free-text search matched case-insensitively against name, sourceType, and description
    q: z.string().trim().min(1).max(100).optional(),
    sourceType: z.string().trim().min(1).max(100).optional(),
    status: z.enum(EVENT_SOURCE_STATUSES).optional(),
    sortBy: z.enum(['name', 'sourceType', 'status', 'updatedAt', 'createdAt']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListEventSourcesQuery = z.infer<typeof listEventSourcesQuerySchema>;

/** Standard paginated response shape for the event source list endpoint. */
export type PaginatedEventSourcesResponseDto = {
  items: EventSourceResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

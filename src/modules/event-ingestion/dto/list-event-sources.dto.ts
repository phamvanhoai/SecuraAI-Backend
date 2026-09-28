import { z } from 'zod';
import { EVENT_SOURCE_STATUSES, type EventSourceResponseDto } from './create-event-source.dto.js';

export const listEventSourcesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    sourceType: z.string().trim().min(1).max(100).optional(),
    status: z.enum(EVENT_SOURCE_STATUSES).optional(),
    sortBy: z.enum(['name', 'sourceType', 'status', 'updatedAt', 'createdAt']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export type ListEventSourcesQuery = z.infer<typeof listEventSourcesQuerySchema>;

export type PaginatedEventSourcesResponseDto = {
  items: EventSourceResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

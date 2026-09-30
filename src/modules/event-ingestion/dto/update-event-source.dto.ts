import { z } from 'zod';
import {
  EVENT_FAMILIES,
  EVENT_SOURCE_STATUSES,
  INGESTION_METHODS,
  type EventSourceResponseDto,
} from './create-event-source.dto.js';

export const updateEventSourceParamsSchema = z
  .object({
    id: z.string().uuid('Invalid event source ID format'),
  })
  .strict();

export type UpdateEventSourceParams = z.infer<typeof updateEventSourceParamsSchema>;

export const updateEventSourceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Source name cannot be empty')
      .max(255, 'Source name cannot exceed 255 characters')
      .optional(),
    endpoint: z
      .string()
      .trim()
      .max(2048, 'Endpoint cannot exceed 2048 characters')
      .nullable()
      .optional(),
    ingestionMethod: z.enum(INGESTION_METHODS).optional(),
    authenticationType: z
      .string()
      .trim()
      .max(100, 'Authentication type cannot exceed 100 characters')
      .nullable()
      .optional(),
    status: z.enum(EVENT_SOURCE_STATUSES).optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .nullable()
      .optional(),
    eventFamilies: z
      .array(z.enum(EVENT_FAMILIES))
      .min(1, 'At least one event family must be selected')
      .optional(),
  })
  .refine(
    (data) => {
      // Check if at least one property is defined
      return Object.values(data).some((val) => val !== undefined);
    },
    {
      message: 'At least one field must be provided for update',
    },
  )
  .refine(
    (data) => {
      if (data.ingestionMethod === 'API' && data.endpoint !== undefined) {
        return typeof data.endpoint === 'string' && data.endpoint.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Endpoint is required when ingestion method is API',
      path: ['endpoint'],
    },
  );

export type UpdateEventSourceInput = z.infer<typeof updateEventSourceSchema>;
export type { EventSourceResponseDto };

import { z } from 'zod';

export const EVENT_FAMILIES = ['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS'] as const;
export const INGESTION_METHODS = ['API', 'FILE'] as const;
export const EVENT_SOURCE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export const createEventSourceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Source name cannot be empty')
      .max(255, 'Source name cannot exceed 255 characters'),
    sourceType: z
      .string()
      .trim()
      .min(1, 'Source type cannot be empty')
      .max(100, 'Source type cannot exceed 100 characters'),
    endpoint: z
      .string()
      .trim()
      .max(2048, 'Endpoint cannot exceed 2048 characters')
      .optional()
      .nullable(),
    ingestionMethod: z.enum(INGESTION_METHODS),
    authenticationType: z
      .string()
      .trim()
      .max(100, 'Authentication type cannot exceed 100 characters')
      .optional()
      .nullable(),
    status: z.enum(EVENT_SOURCE_STATUSES).optional().default('ACTIVE'),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .optional()
      .nullable(),
    eventFamilies: z
      .array(z.enum(EVENT_FAMILIES))
      .min(1, 'At least one event family must be selected'),
  })
  .refine(
    (data) => {
      if (data.ingestionMethod === 'API') {
        return typeof data.endpoint === 'string' && data.endpoint.trim().length > 0;
      }
      return true;
    },
    {
      message: 'Endpoint is required when ingestion method is API',
      path: ['endpoint'],
    },
  );

export type CreateEventSourceInput = z.infer<typeof createEventSourceSchema>;

export type EventSourceResponseDto = {
  id: string;
  name: string;
  sourceType: string;
  endpoint: string | null;
  ingestionMethod: 'API' | 'FILE';
  authenticationType: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  description: string | null;
  eventFamilies: ('AUTHENTICATION' | 'VPN_SSO' | 'APPLICATION_ACCESS')[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

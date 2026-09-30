import { z } from 'zod';
import type { EventSourceResponseDto } from './create-event-source.dto.js';

export const eventSourceIdParamsSchema = z
  .object({
    id: z.string().uuid('Invalid event source ID format'),
  })
  .strict();

export type EventSourceIdParams = z.infer<typeof eventSourceIdParamsSchema>;

export const API_KEY_STATUSES = ['ACTIVE', 'REVOKED', 'EXPIRED', 'ROTATED'] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export type MaskedApiKeyDto = {
  id: string;
  name: string;
  keyPrefix: string;
  maskedKey: string;
  status: ApiKeyStatus;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  createdAt: Date;
};

export type EventSourceDetailResponseDto = EventSourceResponseDto & {
  creator: {
    id: string;
    email: string;
    fullName: string | null;
  } | null;
  apiKeys: MaskedApiKeyDto[];
  stats: {
    totalIngestedEvents: number;
    totalBatches: number;
    lastIngestedAt: Date | null;
  };
};

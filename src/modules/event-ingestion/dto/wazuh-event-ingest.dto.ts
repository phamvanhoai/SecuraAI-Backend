import { z } from 'zod';

export const wazuhEventIngestSchema = z.object({
  source: z.object({
    type: z.literal('WAZUH'),
  }),
  eventFamily: z.enum(['AUTHENTICATION', 'VPN_SSO', 'APPLICATION_ACCESS']),
  eventType: z.string().min(1).max(150),
  timestamp: z.string().min(1),
  rawEventId: z.string().optional(),
  actor: z.object({
    username: z.string().min(1),
    domain: z.string().nullable().optional(),
    userId: z.string().nullable().optional(),
  }),
  sourceIp: z.string().optional(),
  agent: z.object({
    id: z.string(),
    name: z.string(),
    ip: z.string().optional(),
  }),
  rule: z.object({
    id: z.string(),
    level: z.number().int().optional(),
    description: z.string().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type WazuhEventIngestInput = z.infer<typeof wazuhEventIngestSchema>;

export type WazuhIngestResponseDto = {
  eventId: string;
  externalEventId: string | null;
  eventFamily: 'AUTHENTICATION' | 'VPN_SSO' | 'APPLICATION_ACCESS';
  eventType: string;
  status: 'INGESTED';
  ingestedAt: Date;
};

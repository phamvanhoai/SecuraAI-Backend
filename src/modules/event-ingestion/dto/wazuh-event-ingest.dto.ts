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

/** Native Wazuh alert shape. Unknown fields are deliberately retained for the raw/LLM path. */
export const wazuhRawEventSchema = z
  .object({
    id: z.string().optional(),
    timestamp: z.string().optional(),
    '@timestamp': z.string().optional(),
    rule: z.object({
      id: z.union([z.string(), z.number()]),
      level: z.number().int().optional(),
      description: z.string().optional(),
      groups: z.array(z.string()).optional(),
    }).passthrough(),
    agent: z.object({
      id: z.union([z.string(), z.number()]),
      name: z.string().min(1),
      ip: z.string().optional(),
    }).passthrough(),
    data: z.record(z.string(), z.unknown()).optional(),
    decoder: z.object({ name: z.string().optional() }).passthrough().optional(),
    location: z.string().optional(),
    full_log: z.string().optional(),
  })
  .passthrough()
  .refine((value) => !('source' in value) && !('eventFamily' in value), {
    message: 'A normalized payload must satisfy the SecuraAI event schema',
  })
  .refine((value) => Boolean(value.timestamp ?? value['@timestamp']), {
    message: 'A native Wazuh event requires timestamp or @timestamp',
  });

export const wazuhIngestSchema = z.union([wazuhEventIngestSchema, wazuhRawEventSchema]);

export type WazuhEventIngestInput = z.infer<typeof wazuhEventIngestSchema>;
export type WazuhRawEventInput = z.infer<typeof wazuhRawEventSchema>;
export type WazuhIngestInput = z.infer<typeof wazuhIngestSchema>;

export type WazuhIngestResponseDto = {
  eventId: string;
  externalEventId: string | null;
  eventFamily: 'AUTHENTICATION' | 'VPN_SSO' | 'APPLICATION_ACCESS';
  eventType: string;
  status: 'INGESTED';
  ingestedAt: Date;
};

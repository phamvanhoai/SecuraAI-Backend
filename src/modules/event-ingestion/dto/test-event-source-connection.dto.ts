import { z } from 'zod';

export const testEventSourceConnectionSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .min(1, 'Endpoint cannot be empty')
    .max(2048, 'Endpoint cannot exceed 2048 characters'),
  username: z.string().trim().max(255).optional(),
  password: z.string().max(255).optional(),
  verifySsl: z.boolean().optional().default(true),
  timeoutMs: z
    .coerce
    .number()
    .int()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(30000, 'Timeout cannot exceed 30000ms')
    .optional()
    .default(5000),
});

export type TestEventSourceConnectionInput = z.infer<typeof testEventSourceConnectionSchema>;

export const testExistingEventSourceConnectionSchema = z.object({
  username: z.string().trim().max(255).optional(),
  password: z.string().max(255).optional(),
  verifySsl: z.boolean().optional(),
  timeoutMs: z
    .coerce
    .number()
    .int()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(30000, 'Timeout cannot exceed 30000ms')
    .optional()
    .default(5000),
});

export type TestExistingEventSourceConnectionInput = z.infer<
  typeof testExistingEventSourceConnectionSchema
>;

export type TestEventSourceConnectionResponseDto = {
  connected: boolean;
  statusCode: number | null;
  latencyMs: number;
  message: string;
  provider: string;
  details: {
    title: string | null;
    apiVersion: string | null;
    hostname: string | null;
  } | null;
  verifySslWarning: boolean;
};

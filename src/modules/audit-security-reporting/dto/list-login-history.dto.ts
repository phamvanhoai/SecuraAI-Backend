import { isIP } from 'node:net';
import { z } from 'zod';

export const listLoginHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(255).optional(),
    status: z.enum(['success', 'failed']).optional(),
    userId: z.uuid().optional(),
    ipAddress: z
      .string()
      .refine((value) => isIP(value) !== 0, 'Invalid IP address')
      .optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    sortBy: z.literal('loginTime').default('loginTime'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
  .refine((query) => !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to), {
    message: 'from must not be after to',
    path: ['to'],
  });

export type ListLoginHistoryQuery = z.infer<typeof listLoginHistoryQuerySchema>;

export type LoginHistoryList = {
  summary: { successful: number; failed: number; accounts: number };
  items: Array<{
    id: string;
    userId: string | null;
    userName: string | null;
    email: string;
    loginTime: string;
    status: 'success' | 'failed';
    ipAddress: string | null;
    userAgent: string | null;
    failureReason: string | null;
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

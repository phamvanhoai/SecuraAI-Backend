import { z } from 'zod';
export const assetOwnerOptionsQuerySchema = z.object({ q: z.string().trim().max(100).default('') }).strict();

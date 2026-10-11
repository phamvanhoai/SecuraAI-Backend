import { z } from 'zod';
export const assignAssetOwnerBodySchema = z.object({ ownerUserId: z.uuid().nullable(), reason: z.string().trim().min(1).max(1000) }).strict();
export type AssignAssetOwnerInput = z.infer<typeof assignAssetOwnerBodySchema>;

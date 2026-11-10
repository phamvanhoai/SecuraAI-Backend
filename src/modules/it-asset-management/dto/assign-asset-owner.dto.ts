import { z } from 'zod';
export const assignAssetOwnerBodySchema = z.object({ ownerUserId: z.uuid().nullable(), reason: z.string().trim().min(20, "Enter at least 20 characters.").max(1000) }).strict();
export type AssignAssetOwnerInput = z.infer<typeof assignAssetOwnerBodySchema>;

import { listAssetsQuerySchema } from './list-assets-query.dto.js';

export const exportAssetsQuerySchema = listAssetsQuerySchema
  .omit({ page: true, limit: true })
  .strict();

export type ExportAssetsQuery = ReturnType<typeof exportAssetsQuerySchema.parse>;

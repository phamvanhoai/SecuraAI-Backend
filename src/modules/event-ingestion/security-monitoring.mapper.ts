import type { LogSourceRecord } from './security-monitoring.repository.js';

export type LogSourceResponse = {
  id: string;
  name: string;
  sourceType: string;
  asset: { id: string; assetCode: string; name: string } | null;
  integration: { id: string; name: string; type: string } | null;
  configuration: unknown;
  status: string;
  lastReceivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const toLogSourceResponse = (source: LogSourceRecord): LogSourceResponse => ({
  id: source.log_source_id,
  name: source.name,
  sourceType: source.source_type,
  asset: source.assets
    ? { id: source.assets.asset_id, assetCode: source.assets.asset_code, name: source.assets.name }
    : null,
  integration: source.integrations
    ? {
        id: source.integrations.integration_id,
        name: source.integrations.name,
        type: source.integrations.integration_type,
      }
    : null,
  configuration: source.configuration,
  status: source.status,
  lastReceivedAt: source.last_received_at,
  createdAt: source.created_at,
  updatedAt: source.updated_at,
});

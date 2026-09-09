export type IntegrationResponseDto = {
  id: string;
  name: string;
  integrationType: string;
  baseUrl: string | null;
  configuration: unknown;
  status: string;
  lastConnectedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RawIntegrationRecord = {
  integration_id: string;
  name: string;
  integration_type: string;
  base_url: string | null;
  configuration: unknown;
  status: string;
  last_connected_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export function toIntegrationResponseDto(record: RawIntegrationRecord): IntegrationResponseDto {
  return {
    id: record.integration_id,
    name: record.name,
    integrationType: record.integration_type,
    baseUrl: record.base_url,
    configuration: record.configuration,
    status: record.status,
    lastConnectedAt: record.last_connected_at ? record.last_connected_at.toISOString() : null,
    createdByUserId: record.created_by_user_id,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString(),
  };
}

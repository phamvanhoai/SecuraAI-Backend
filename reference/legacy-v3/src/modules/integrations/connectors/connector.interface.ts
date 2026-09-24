export interface ConnectorTestResult {
  connected: boolean;
  statusCode?: number;
  latencyMs: number;
  message: string;
  provider: string;
  details?: Record<string, unknown>;
  verifySslWarning?: boolean;
}

export interface IntegrationEntity {
  integration_id: string;
  name: string;
  integration_type: string;
  base_url: string | null;
  configuration: unknown;
  status: string;
}

export interface IntegrationConnector {
  testConnection(integration: IntegrationEntity, options?: { timeoutMs?: number }): Promise<ConnectorTestResult>;
}

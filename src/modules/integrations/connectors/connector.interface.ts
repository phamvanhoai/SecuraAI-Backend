export type ConnectorTestResult = {
  connected: boolean;
  statusCode?: number | null | undefined;
  latencyMs: number;
  message: string;
  provider: string;
  verifySslWarning?: boolean | undefined;
  details?: Record<string, unknown> | undefined;
};

export type IntegrationEntity = {
  integration_id: string;
  name: string;
  integration_type: string;
  base_url: string | null;
  configuration: unknown;
  status: string;
};

export interface IntegrationConnector {
  testConnection(
    integration: IntegrationEntity,
    options?: { timeoutMs?: number },
  ): Promise<ConnectorTestResult>;
}

import { executeSafeHttpRequest } from '../../../common/utils/ssrf-validator.js';
import type { IntegrationConnector, IntegrationEntity, ConnectorTestResult } from './connector.interface.js';

export class GenericHttpConnector implements IntegrationConnector {
  async testConnection(
    integration: IntegrationEntity,
    options?: { timeoutMs?: number },
  ): Promise<ConnectorTestResult> {
    if (!integration.base_url) {
      return {
        connected: false,
        latencyMs: 0,
        message: 'Integration base URL is not configured',
        provider: 'generic-http',
      };
    }

    const config = (integration.configuration as Record<string, unknown> | null) ?? {};
    const verifySsl = config.verifySsl !== false;
    const timeoutMs = options?.timeoutMs ?? 5000;
    const startTime = Date.now();

    try {
      const res = await executeSafeHttpRequest({
        url: integration.base_url,
        method: 'GET',
        timeoutMs,
        rejectUnauthorized: verifySsl,
      });

      const latencyMs = Date.now() - startTime;

      if (res.ok) {
        return {
          connected: true,
          statusCode: res.statusCode,
          latencyMs,
          message: `Connection check succeeded with status ${res.statusCode} (${latencyMs}ms)`,
          provider: 'generic-http',
          verifySslWarning: !verifySsl,
        };
      }

      return {
        connected: false,
        statusCode: res.statusCode,
        latencyMs,
        message: `External endpoint responded with HTTP status ${res.statusCode} (${res.statusText || 'Non-success'})`,
        provider: 'generic-http',
        verifySslWarning: !verifySsl,
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Unknown network or socket error';

      return {
        connected: false,
        statusCode: null,
        latencyMs,
        message: `Connection check failed: ${errorMessage}`,
        provider: 'generic-http',
        verifySslWarning: !verifySsl,
      };
    }
  }
}

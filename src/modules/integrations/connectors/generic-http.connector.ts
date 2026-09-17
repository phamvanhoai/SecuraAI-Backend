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
    const timeoutMs = options?.timeoutMs ?? 10000;
    const startTime = Date.now();

    try {
      const res = await executeSafeHttpRequest({
        url: integration.base_url,
        method: 'GET',
        timeoutMs,
        rejectUnauthorized: verifySsl,
      });

      return {
        connected: res.ok,
        statusCode: res.statusCode,
        latencyMs: res.latencyMs,
        message: res.ok
          ? 'Connection established successfully'
          : `HTTP ${res.statusCode} (${res.statusText || 'Non-success'})`,
        provider: 'generic-http',
        verifySslWarning: !verifySsl,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return {
        connected: false,
        latencyMs: Date.now() - startTime,
        message: `Connection check failed: ${message}`,
        provider: 'generic-http',
        verifySslWarning: !verifySsl,
      };
    }
  }
}

import { executeSafeHttpRequest } from '../../../common/utils/ssrf-validator.js';
import type { IntegrationConnector, IntegrationEntity, ConnectorTestResult } from './connector.interface.js';

function extractString(val: unknown, fallback = ''): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return `${val}`;
  return fallback;
}

export class WazuhConnector implements IntegrationConnector {
  async testConnection(
    integration: IntegrationEntity,
    options?: { timeoutMs?: number },
  ): Promise<ConnectorTestResult> {
    if (!integration.base_url) {
      return {
        connected: false,
        latencyMs: 0,
        message: 'Integration base URL is not configured',
        provider: 'wazuh',
      };
    }

    const baseUrl = integration.base_url.replace(/\/+$/, '');
    const config = (integration.configuration as Record<string, unknown> | null) ?? {};
    const username = extractString(config.username, 'wazuh');
    const password = extractString(config.password, 'wazuh');
    const verifySsl = config.verifySsl !== false;
    const timeoutMs = options?.timeoutMs ?? 10000;
    const startTime = Date.now();

    // Step 1: Authenticate with HTTP Basic Auth to get JWT Token
    // Endpoint: POST /security/user/authenticate?raw=true
    const basicAuthHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    let authRes;

    try {
      authRes = await executeSafeHttpRequest({
        url: `${baseUrl}/security/user/authenticate?raw=true`,
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader,
          Accept: 'text/plain, application/json',
        },
        timeoutMs,
        rejectUnauthorized: verifySsl,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return {
        connected: false,
        latencyMs: Date.now() - startTime,
        message: `Failed to reach Wazuh authentication endpoint: ${message}`,
        provider: 'wazuh',
        verifySslWarning: !verifySsl,
      };
    }

    if (!authRes.ok || authRes.statusCode === 401) {
      return {
        connected: false,
        statusCode: authRes.statusCode,
        latencyMs: Date.now() - startTime,
        message: authRes.statusCode === 401
          ? 'Wazuh authentication failed: Invalid username or password'
          : `Wazuh authentication returned HTTP ${authRes.statusCode}`,
        provider: 'wazuh',
        verifySslWarning: !verifySsl,
      };
    }

    // Extract raw JWT string from body or JSON
    let jwtToken = '';
    if (typeof authRes.body === 'string') {
      jwtToken = authRes.body.trim().replace(/^"|"$/g, '');
    } else if (authRes.body && typeof authRes.body === 'object') {
      const bodyObj = authRes.body as Record<string, unknown>;
      const dataObj = bodyObj.data as Record<string, unknown> | undefined;
      jwtToken = extractString(dataObj?.token ?? bodyObj.token, '');
    }

    if (!jwtToken || jwtToken.length < 10) {
      return {
        connected: false,
        statusCode: authRes.statusCode,
        latencyMs: Date.now() - startTime,
        message: 'Wazuh API did not return a valid JWT token',
        provider: 'wazuh',
        verifySslWarning: !verifySsl,
      };
    }

    // Step 2: Probe root info with Bearer JWT Token
    // Endpoint: GET /
    let infoRes;
    try {
      infoRes = await executeSafeHttpRequest({
        url: `${baseUrl}/`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          Accept: 'application/json',
        },
        timeoutMs,
        rejectUnauthorized: verifySsl,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      return {
        connected: false,
        latencyMs: Date.now() - startTime,
        message: `Failed to query Wazuh API root with token: ${message}`,
        provider: 'wazuh',
        verifySslWarning: !verifySsl,
      };
    }

    const totalLatency = Date.now() - startTime;

    if (!infoRes.ok) {
      return {
        connected: false,
        statusCode: infoRes.statusCode,
        latencyMs: totalLatency,
        message: `Wazuh API root returned HTTP ${infoRes.statusCode}`,
        provider: 'wazuh',
        verifySslWarning: !verifySsl,
      };
    }

    // Parse Wazuh metadata
    let apiVersion = 'unknown';
    let hostname = 'unknown';
    let title = 'Wazuh REST API';

    if (infoRes.body && typeof infoRes.body === 'object') {
      const infoBody = infoRes.body as Record<string, unknown>;
      const data = (infoBody.data as Record<string, unknown> | undefined) ?? infoBody;
      apiVersion = extractString(data.api_version ?? data.apiVersion, 'unknown');
      hostname = extractString(data.hostname, 'unknown');
      title = extractString(data.title, 'Wazuh REST API');
    }

    return {
      connected: true,
      statusCode: infoRes.statusCode,
      latencyMs: totalLatency,
      message: 'Wazuh API connected and authenticated successfully',
      provider: 'wazuh',
      details: {
        title,
        apiVersion,
        hostname,
      },
      verifySslWarning: !verifySsl,
    };
  }
}

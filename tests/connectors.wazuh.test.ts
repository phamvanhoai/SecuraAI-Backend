import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WazuhConnector } from '../src/modules/integrations/connectors/wazuh.connector.js';
import { resolveConnector } from '../src/modules/integrations/connectors/connector.factory.js';
import * as ssrfValidator from '../src/common/utils/ssrf-validator.js';

describe('Wazuh Connector Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves WazuhConnector when provider is wazuh or authType is wazuh_jwt', () => {
    const connector1 = resolveConnector({
      integration_id: 'i1',
      name: 'Wazuh Lab',
      integration_type: 'siem',
      base_url: 'https://192.168.56.101:55000',
      configuration: { provider: 'wazuh' },
      status: 'active',
    });
    expect(connector1).toBeInstanceOf(WazuhConnector);

    const connector2 = resolveConnector({
      integration_id: 'i2',
      name: 'Wazuh Lab 2',
      integration_type: 'siem',
      base_url: 'https://192.168.56.101:55000',
      configuration: { authType: 'wazuh_jwt' },
      status: 'active',
    });
    expect(connector2).toBeInstanceOf(WazuhConnector);
  });

  it('performs 2-step auth (POST /security/user/authenticate -> GET /) and returns details', async () => {
    const connector = new WazuhConnector();
    const executeSpy = vi.spyOn(ssrfValidator, 'executeSafeHttpRequest');

    // Mock Step 1: POST /security/user/authenticate
    executeSpy.mockResolvedValueOnce({
      statusCode: 200,
      statusText: 'OK',
      latencyMs: 30,
      ok: true,
      body: 'mock-jwt-token-abcdef1234567890',
    });

    // Mock Step 2: GET /
    executeSpy.mockResolvedValueOnce({
      statusCode: 200,
      statusText: 'OK',
      latencyMs: 15,
      ok: true,
      body: {
        data: {
          title: 'Wazuh REST API',
          api_version: '4.14.7',
          hostname: 'wazuh-lab-ubuntu',
        },
      },
    });

    const result = await connector.testConnection({
      integration_id: 'wazuh-id',
      name: 'Wazuh Lab',
      integration_type: 'siem',
      base_url: 'https://192.168.56.101:55000',
      configuration: {
        username: 'wazuh',
        password: 'wazuh',
        verifySsl: false,
      },
      status: 'inactive',
    });

    expect(result.connected).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.provider).toBe('wazuh');
    expect(result.verifySslWarning).toBe(true);
    expect(result.details).toEqual({
      title: 'Wazuh REST API',
      apiVersion: '4.14.7',
      hostname: 'wazuh-lab-ubuntu',
    });
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it('returns connected: false with message when Step 1 authentication fails with 401', async () => {
    const connector = new WazuhConnector();
    vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockResolvedValueOnce({
      statusCode: 401,
      statusText: 'Unauthorized',
      latencyMs: 25,
      ok: false,
      body: { message: 'Invalid credentials' },
    });

    const result = await connector.testConnection({
      integration_id: 'wazuh-id',
      name: 'Wazuh Lab',
      integration_type: 'siem',
      base_url: 'https://192.168.56.101:55000',
      configuration: {
        username: 'wazuh',
        password: 'wrong_password',
      },
      status: 'inactive',
    });

    expect(result.connected).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.message).toContain('Invalid username or password');
  });

  it('handles network error during test connection gracefully', async () => {
    const connector = new WazuhConnector();
    vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockRejectedValueOnce(
      new Error('Connection timed out after 5000ms'),
    );

    const result = await connector.testConnection({
      integration_id: 'wazuh-id',
      name: 'Wazuh Lab',
      integration_type: 'siem',
      base_url: 'https://192.168.56.101:55000',
      configuration: {},
      status: 'inactive',
    });

    expect(result.connected).toBe(false);
    expect(result.message).toContain('Connection timed out');
  });
});

import { describe, expect, it, vi } from 'vitest';
import * as ssrfValidator from '../src/common/utils/ssrf-validator.js';
import { WazuhConnector } from '../src/modules/integrations/connectors/wazuh.connector.js';
import { GenericHttpConnector } from '../src/modules/integrations/connectors/generic-http.connector.js';
import { resolveConnector } from '../src/modules/integrations/connectors/connector.factory.js';

describe('Wazuh Connector & Factory Unit Tests', () => {
  describe('Connector Factory (Fail-closed)', () => {
    it('resolves WazuhConnector when explicit provider is "wazuh"', () => {
      const connector = resolveConnector({
        integration_id: '1',
        name: 'Wazuh SIEM',
        integration_type: 'siem',
        base_url: 'https://192.168.56.101:55000',
        configuration: { provider: 'wazuh' },
        status: 'inactive',
      });
      expect(connector).toBeInstanceOf(WazuhConnector);
    });

    it('resolves WazuhConnector when authType is "wazuh_jwt"', () => {
      const connector = resolveConnector({
        integration_id: '1',
        name: 'Wazuh SIEM',
        integration_type: 'siem',
        base_url: 'https://192.168.56.101:55000',
        configuration: { authType: 'wazuh_jwt' },
        status: 'inactive',
      });
      expect(connector).toBeInstanceOf(WazuhConnector);
    });

    it('resolves GenericHttpConnector for generic integrations', () => {
      const connector = resolveConnector({
        integration_id: '2',
        name: 'Generic Probe',
        integration_type: 'api',
        base_url: 'https://api.example.com',
        configuration: {},
        status: 'active',
      });
      expect(connector).toBeInstanceOf(GenericHttpConnector);
    });

    it('fails closed and throws for unsupported explicit provider', () => {
      expect(() =>
        resolveConnector({
          integration_id: '3',
          name: 'Unsupported SIEM',
          integration_type: 'siem',
          base_url: 'https://alien.example.com',
          configuration: { provider: 'alien_vault_unknown' },
          status: 'inactive',
        }),
      ).toThrow('is not supported');
    });
  });

  describe('WazuhConnector 2-Step Authentication & Test Connection', () => {
    const wazuhIntegration = {
      integration_id: '100',
      name: 'Wazuh Lab',
      integration_type: 'siem',
      base_url: 'https://192.168.56.101:55000',
      configuration: {
        provider: 'wazuh',
        username: 'wazuh',
        password: 'wazuh_password',
        verifySsl: false,
      },
      status: 'inactive',
    };

    it('successfully authenticates with Basic Auth, gets JWT and queries root info', async () => {
      const mockExecute = vi.spyOn(ssrfValidator, 'executeSafeHttpRequest');

      // Step 1: POST /security/user/authenticate?raw=true -> returns JWT string
      mockExecute.mockResolvedValueOnce({
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 25,
        ok: true,
        body: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_wazuh_token',
      });

      // Step 2: GET / -> returns Wazuh info
      mockExecute.mockResolvedValueOnce({
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 15,
        ok: true,
        body: {
          data: {
            title: 'Wazuh REST API',
            api_version: '4.14.7',
            hostname: 'wazuh-ubuntu-lab',
          },
          error: 0,
        },
      });

      const connector = new WazuhConnector();
      const result = await connector.testConnection(wazuhIntegration);

      expect(result.connected).toBe(true);
      expect(result.provider).toBe('wazuh');
      expect(result.verifySslWarning).toBe(true);
      expect(result.details?.apiVersion).toBe('4.14.7');
      expect(result.details?.hostname).toBe('wazuh-ubuntu-lab');

      // Verify correct headers and endpoints were called
      expect(mockExecute).toHaveBeenCalledTimes(2);
      const firstCall = mockExecute.mock.calls[0]?.[0];
      expect(firstCall?.url).toBe('https://192.168.56.101:55000/security/user/authenticate?raw=true');
      expect(firstCall?.method).toBe('POST');
      expect(firstCall?.headers?.['Authorization']).toContain('Basic ');
      expect(firstCall?.rejectUnauthorized).toBe(false);

      const secondCall = mockExecute.mock.calls[1]?.[0];
      expect(secondCall?.url).toBe('https://192.168.56.101:55000/');
      expect(secondCall?.method).toBe('GET');
      expect(secondCall?.headers?.['Authorization']).toBe('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_wazuh_token');
    });

    it('handles Wazuh 401 Unauthorized gracefully', async () => {
      vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockResolvedValueOnce({
        statusCode: 401,
        statusText: 'Unauthorized',
        latencyMs: 20,
        ok: false,
        body: { message: 'Invalid credentials' },
      });

      const connector = new WazuhConnector();
      const result = await connector.testConnection(wazuhIntegration);

      expect(result.connected).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.message).toContain('Invalid username or password');
    });

    it('handles connection timeout or network errors during authenticate', async () => {
      vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockRejectedValueOnce(
        new Error('Connection timed out after 10000ms'),
      );

      const connector = new WazuhConnector();
      const result = await connector.testConnection(wazuhIntegration);

      expect(result.connected).toBe(false);
      expect(result.message).toContain('Failed to reach Wazuh authentication endpoint');
    });
  });
});

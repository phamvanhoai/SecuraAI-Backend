import { describe, expect, it, vi, beforeEach } from 'vitest';
import { integrationsService } from '../src/modules/integrations/integrations.service.js';
import { integrationsRepository } from '../src/modules/integrations/integrations.repository.js';
import * as ssrfValidator from '../src/common/utils/ssrf-validator.js';

describe('Integrations Service (UC 13.1 - Connect SIEM/Firewall)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('createIntegration', () => {
    it('creates an integration successfully and logs audit event', async () => {
      vi.spyOn(ssrfValidator, 'validateExternalUrl').mockResolvedValue(new URL('https://siem.test.com'));
      const mockRecord = {
        integration_id: 'c1234567-1111-2222-3333-444455556666',
        name: 'Splunk SIEM',
        integration_type: 'siem',
        base_url: 'https://siem.test.com',
        configuration: null,
        status: 'inactive',
        last_connected_at: null,
        created_by_user_id: 'u1111111-2222-3333-4444-555566667777',
        created_at: new Date('2026-09-01T00:00:00Z'),
        updated_at: new Date('2026-09-01T00:00:00Z'),
      };

      const createSpy = vi.spyOn(integrationsRepository, 'create').mockResolvedValue(mockRecord);
      const createLogSpy = vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: 'log-1',
        integration_id: mockRecord.integration_id,
        level: 'info',
        message: 'Integration created',
        created_at: new Date(),
      });

      const result = await integrationsService.createIntegration(
        {
          name: 'Splunk SIEM',
          integrationType: 'siem',
          baseUrl: 'https://siem.test.com',
        },
        'u1111111-2222-3333-4444-555566667777',
      );

      expect(result.id).toBe(mockRecord.integration_id);
      expect(result.name).toBe('Splunk SIEM');
      expect(result.status).toBe('inactive');
      expect(createSpy).toHaveBeenCalledOnce();
      expect(createLogSpy).toHaveBeenCalledOnce();
    });
  });

  describe('testConnection', () => {
    it('throws error when integration does not exist', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(null);

      await expect(
        integrationsService.testConnection('c1234567-0000-0000-0000-000000000000', { timeoutMs: 5000 }),
      ).rejects.toThrow('Integration with ID');
    });

    it('throws error when no baseUrl is configured', async () => {
      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue({
        integration_id: 'c1234567-0000-0000-0000-000000000000',
        name: 'No URL',
        integration_type: 'log_source',
        base_url: null,
        configuration: null,
        status: 'inactive',
        last_connected_at: null,
        created_by_user_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        integrationsService.testConnection('c1234567-0000-0000-0000-000000000000', { timeoutMs: 5000 }),
      ).rejects.toThrow('No base URL configured');
    });

    it('marks integration active and records last_connected_at on success', async () => {
      const mockRecord = {
        integration_id: 'c1234567-0000-0000-0000-000000000000',
        name: 'Live SIEM',
        integration_type: 'siem',
        base_url: 'https://live-siem.example.com',
        configuration: null,
        status: 'inactive',
        last_connected_at: null,
        created_by_user_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockRecord);
      vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockResolvedValue({
        statusCode: 200,
        statusText: 'OK',
        latencyMs: 150,
        ok: true,
      });

      const updateSpy = vi.spyOn(integrationsRepository, 'update').mockResolvedValue({
        ...mockRecord,
        status: 'active',
        last_connected_at: new Date(),
      });

      const logSpy = vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: 'log-test',
        integration_id: mockRecord.integration_id,
        level: 'info',
        message: 'Connection test succeeded',
        created_at: new Date(),
      });

      const result = await integrationsService.testConnection(mockRecord.integration_id, { timeoutMs: 5000 });

      expect(result.connected).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.latencyMs).toBe(150);
      expect(updateSpy).toHaveBeenCalledWith(
        mockRecord.integration_id,
        expect.objectContaining({ status: 'active' }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'info' }),
      );
    });

    it('marks integration as error when endpoint returns 500', async () => {
      const mockRecord = {
        integration_id: 'c1234567-0000-0000-0000-000000000000',
        name: 'Failing Firewall',
        integration_type: 'firewall',
        base_url: 'https://firewall.example.com',
        configuration: null,
        status: 'active',
        last_connected_at: null,
        created_by_user_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(integrationsRepository, 'findById').mockResolvedValue(mockRecord);
      vi.spyOn(ssrfValidator, 'executeSafeHttpRequest').mockResolvedValue({
        statusCode: 500,
        statusText: 'Internal Server Error',
        latencyMs: 320,
        ok: false,
      });

      const updateSpy = vi.spyOn(integrationsRepository, 'update').mockResolvedValue({
        ...mockRecord,
        status: 'error',
      });
      const logSpy = vi.spyOn(integrationsRepository, 'createLog').mockResolvedValue({
        integration_log_id: 'log-err',
        integration_id: mockRecord.integration_id,
        level: 'warn',
        message: 'Connection test returned HTTP 500',
        created_at: new Date(),
      });

      const result = await integrationsService.testConnection(mockRecord.integration_id, { timeoutMs: 5000 });

      expect(result.connected).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(updateSpy).toHaveBeenCalledWith(
        mockRecord.integration_id,
        expect.objectContaining({ status: 'error' }),
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' }),
      );
    });
  });

  describe('SSRF Protection Rules', () => {
    it('detects and rejects loopback and private IPv4 addresses', () => {
      expect(ssrfValidator.isForbiddenIp('127.0.0.1')).toBe(true);
      expect(ssrfValidator.isForbiddenIp('10.0.0.1')).toBe(true);
      expect(ssrfValidator.isForbiddenIp('172.16.0.1')).toBe(true);
      expect(ssrfValidator.isForbiddenIp('192.168.1.100')).toBe(true);
      expect(ssrfValidator.isForbiddenIp('169.254.169.254')).toBe(true);
    });

    it('detects and rejects loopback and link-local IPv6 addresses', () => {
      expect(ssrfValidator.isForbiddenIp('::1')).toBe(true);
      expect(ssrfValidator.isForbiddenIp('fe80::1')).toBe(true);
      expect(ssrfValidator.isForbiddenIp('fc00::1')).toBe(true);
    });

    it('allows public IP addresses', () => {
      expect(ssrfValidator.isForbiddenIp('8.8.8.8')).toBe(false);
      expect(ssrfValidator.isForbiddenIp('1.1.1.1')).toBe(false);
    });
  });
});

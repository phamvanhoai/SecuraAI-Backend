import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { integrationsService } from '../src/modules/integrations/integrations.service.js';
import { integrationsRepository } from '../src/modules/integrations/integrations.repository.js';
import * as ssrfValidator from '../src/common/utils/ssrf-validator.js';

vi.mock('../src/modules/integrations/integrations.repository.js');
vi.mock('../src/common/utils/ssrf-validator.js');

describe('Integrations Service - Connection Monitoring', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConnectionStatusSummary', () => {
    it('calculates fleet availability %, average latency, and failing integrations from logs', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();
      const id3 = randomUUID();

      const mockIntegrations = [
        {
          integration_id: id1,
          name: 'Splunk SIEM',
          integration_type: 'siem',
          base_url: 'https://splunk.test.local',
          configuration: null,
          status: 'active',
          last_connected_at: new Date('2026-09-15T10:00:00Z'),
          created_by_user_id: null,
          created_at: new Date('2026-09-01T00:00:00Z'),
          updated_at: new Date('2026-09-15T10:00:00Z'),
        },
        {
          integration_id: id2,
          name: 'FortiGate Firewall',
          integration_type: 'firewall',
          base_url: 'https://fw.test.local',
          configuration: null,
          status: 'error',
          last_connected_at: new Date('2026-09-14T08:00:00Z'),
          created_by_user_id: null,
          created_at: new Date('2026-09-01T00:00:00Z'),
          updated_at: new Date('2026-09-15T09:00:00Z'),
        },
        {
          integration_id: id3,
          name: 'Unused Syslog',
          integration_type: 'log_source',
          base_url: null,
          configuration: null,
          status: 'inactive',
          last_connected_at: null,
          created_by_user_id: null,
          created_at: new Date('2026-09-01T00:00:00Z'),
          updated_at: new Date('2026-09-01T00:00:00Z'),
        },
      ];

      const mockLogs = [
        {
          integration_log_id: randomUUID(),
          integration_id: id1,
          level: 'info',
          message: 'Connection check succeeded with status 200 (45ms)',
          details: {
            action: 'CONNECTION_CHECK',
            latencyMs: 45,
            httpStatus: 200,
            success: true,
            errorCode: null,
          },
          created_at: new Date('2026-09-15T10:00:00Z'),
          integrations: { name: 'Splunk SIEM' },
        },
        {
          integration_log_id: randomUUID(),
          integration_id: id1,
          level: 'info',
          message: 'Connection check succeeded with status 200 (55ms)',
          details: {
            action: 'CONNECTION_CHECK',
            latencyMs: 55,
            httpStatus: 200,
            success: true,
            errorCode: null,
          },
          created_at: new Date('2026-09-15T09:00:00Z'),
          integrations: { name: 'Splunk SIEM' },
        },
        {
          integration_log_id: randomUUID(),
          integration_id: id2,
          level: 'error',
          message: 'Connection check failed: Connection timeout',
          details: {
            action: 'CONNECTION_CHECK',
            latencyMs: 5000,
            httpStatus: null,
            success: false,
            errorCode: 'NETWORK_ERROR',
          },
          created_at: new Date('2026-09-15T09:30:00Z'),
          integrations: { name: 'FortiGate Firewall' },
        },
      ];

      vi.mocked(integrationsRepository.findConnectionMonitoringData).mockResolvedValue([
        mockIntegrations,
        mockLogs,
      ]);


      const summary = await integrationsService.getConnectionStatusSummary({ timeWindow: '24h' });

      expect(summary.totalIntegrations).toBe(3);
      expect(summary.activeCount).toBe(1);
      expect(summary.errorCount).toBe(1);
      expect(summary.inactiveCount).toBe(1);
      expect(summary.pendingCount).toBe(0);
      expect(summary.checks24h).toBe(3);
      expect(summary.successfulChecks24h).toBe(2);
      expect(summary.failedChecks24h).toBe(1);
      // availability = (2 / 3) * 100 = 66.7%
      expect(summary.availability24h).toBe(66.7);
      // avg latency of successful checks = (45 + 55) / 2 = 50ms
      expect(summary.averageLatency24h).toBe(50);
      expect(summary.failingIntegrations).toHaveLength(1);
      expect(summary.failingIntegrations[0]?.name).toBe('FortiGate Firewall');
      expect(summary.failingIntegrations[0]?.lastErrorMessage).toContain('Connection timeout');
    });

    it('handles empty check history safely without division by zero', async () => {
      vi.mocked(integrationsRepository.findConnectionMonitoringData).mockResolvedValue([
        [
          {
            integration_id: randomUUID(),
            name: 'Palo Alto FW',
            integration_type: 'firewall',
            base_url: 'https://fw.test',
            configuration: null,
            status: 'inactive',
            last_connected_at: null,
            created_by_user_id: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ] as never,
        [],
      ]);

      const summary = await integrationsService.getConnectionStatusSummary();
      expect(summary.checks24h).toBe(0);
      expect(summary.availability24h).toBeNull();
      expect(summary.averageLatency24h).toBeNull();
      expect(summary.failingIntegrations).toHaveLength(0);
    });
  });

  describe('checkAllConnections (Batch Health Probe)', () => {
    it('probes multiple integrations and handles partial failure gracefully', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();

      const mockConfigured = [
        {
          integration_id: id1,
          name: 'Healthy Wazuh',
          integration_type: 'siem',
          base_url: 'https://wazuh.test',
          status: 'inactive',
          last_connected_at: null,
        },
        {
          integration_id: id2,
          name: 'Unreachable Endpoint',
          integration_type: 'firewall',
          base_url: 'https://dead-endpoint.test',
          status: 'active',
          last_connected_at: new Date('2026-09-10T00:00:00Z'),
        },
      ];

      vi.mocked(integrationsRepository.findConfiguredIntegrationsForProbe).mockResolvedValue(mockConfigured as never);
      vi.mocked(integrationsRepository.update).mockResolvedValue({} as never);
      vi.mocked(integrationsRepository.createLog).mockResolvedValue({} as never);

      // Mock executeSafeHttpRequest
      vi.mocked(ssrfValidator.executeSafeHttpRequest).mockImplementation(async ({ url }) => {
        if (url.includes('dead')) {
          return {
            statusCode: 503,
            statusText: 'Service Unavailable',
            latencyMs: 120,
            ok: false,
            body: null,
          };
        }
        return {
          statusCode: 200,
          statusText: 'OK',
          latencyMs: 38,
          ok: true,
          body: { status: 'healthy' },
        };
      });

      const report = await integrationsService.checkAllConnections({ timeoutMs: 3000 });

      expect(report.totalTested).toBe(2);
      expect(report.successful).toBe(1);
      expect(report.failed).toBe(1);

      const healthyResult = report.results.find((r) => r.integrationId === id1);
      const failedResult = report.results.find((r) => r.integrationId === id2);

      expect(healthyResult?.connected).toBe(true);
      expect(healthyResult?.statusCode).toBe(200);
      expect(healthyResult?.latencyMs).toBe(38);

      expect(failedResult?.connected).toBe(false);
      expect(failedResult?.statusCode).toBe(503);

      // Successful connection should update last_connected_at
      expect(integrationsRepository.update).toHaveBeenCalledWith(id1, {
        status: 'active',
        last_connected_at: expect.any(Date),
      });

      // Failed connection should update status to error but NOT update last_connected_at
      expect(integrationsRepository.update).toHaveBeenCalledWith(id2, {
        status: 'error',
      });
    });

    it('returns empty results when no integrations have base_url configured', async () => {
      vi.mocked(integrationsRepository.findConfiguredIntegrationsForProbe).mockResolvedValue([]);

      const report = await integrationsService.checkAllConnections({});
      expect(report.totalTested).toBe(0);
      expect(report.successful).toBe(0);
      expect(report.failed).toBe(0);
      expect(report.results).toEqual([]);
    });
  });

  describe('getIntegrationConnectionStatus', () => {
    it('returns single integration connection telemetry and recent probe logs', async () => {
      const id = randomUUID();
      const mockIntegration = {
        integration_id: id,
        name: 'Elasticsearch Cluster',
        integration_type: 'siem',
        base_url: 'https://elastic.test:9200',
        status: 'active',
        last_connected_at: new Date('2026-09-15T12:00:00Z'),
        created_at: new Date('2026-09-01T00:00:00Z'),
        updated_at: new Date('2026-09-15T12:00:00Z'),
      };

      const mockLogs = [
        {
          integration_log_id: randomUUID(),
          integration_id: id,
          level: 'info',
          message: 'Connection check succeeded with status 200 (42ms)',
          details: {
            action: 'CONNECTION_CHECK',
            latencyMs: 42,
            httpStatus: 200,
            success: true,
            errorCode: null,
          },
          created_at: new Date(Date.now() - 3600_000),
        },
      ];

      vi.mocked(integrationsRepository.findById).mockResolvedValue(mockIntegration as never);
      vi.mocked(integrationsRepository.findRecentConnectionLogs).mockResolvedValue(mockLogs as never);

      const res = await integrationsService.getIntegrationConnectionStatus(id);

      expect(res.id).toBe(id);
      expect(res.name).toBe('Elasticsearch Cluster');
      expect(res.status).toBe('active');
      expect(res.checks24h).toBe(1);
      expect(res.successfulChecks24h).toBe(1);
      expect(res.availability24h).toBe(100.0);
      expect(res.averageLatency24h).toBe(42);
      expect(res.recentLogs).toHaveLength(1);
    });

    it('throws 404 for non-existent integration ID', async () => {
      vi.mocked(integrationsRepository.findById).mockResolvedValue(null);

      await expect(integrationsService.getIntegrationConnectionStatus(randomUUID())).rejects.toThrow(
        'was not found',
      );
    });
  });
});

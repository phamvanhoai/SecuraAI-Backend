import { describe, expect, it, vi } from 'vitest';
import { buildWhereClause, integrationsRepository } from '@/modules/integrations/integrations.repository.js';
import { prisma } from '@/database/prisma.js';

describe('Integrations Repository', () => {
  it('calls prisma.integrations.create with explicit select fields', async () => {
    const mockCreated = {
      integration_id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Fortinet Firewall',
      integration_type: 'firewall',
      base_url: 'https://fortinet.example.com',
      configuration: null,
      status: 'inactive',
      last_connected_at: null,
      created_by_user_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const createSpy = vi.spyOn(prisma.integrations, 'create').mockResolvedValue(mockCreated);

    const result = await integrationsRepository.create({
      name: 'Fortinet Firewall',
      integration_type: 'firewall',
      base_url: 'https://fortinet.example.com',
    });

    expect(result.integration_id).toBe(mockCreated.integration_id);
    const callArgs = createSpy.mock.calls[0]?.[0];
    expect(callArgs?.data.name).toBe('Fortinet Firewall');
    expect(callArgs?.data.integration_type).toBe('firewall');
    expect(callArgs?.select?.integration_id).toBe(true);
    expect(callArgs?.select?.name).toBe(true);
  });

  it('correctly builds where clause for filtering and search', () => {
    const where = buildWhereClause({
      type: 'siem',
      status: 'active',
      search: 'splunk',
    });

    expect(where.integration_type).toBe('siem');
    expect(where.status).toBe('active');
    expect(where.OR).toBeDefined();
    expect(where.OR).toHaveLength(2);
  });
});

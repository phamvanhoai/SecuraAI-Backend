// Opt-in development DB verification. All temporary rows, including audits,
// are rolled back; immutable audit records are never deleted.
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ blocked: false, assetId: '', dependentId: '' }));
vi.mock('../src/database/prisma.js', async (original) => {
  const { prisma: live } = await original<{ prisma: PrismaClient }>();
  return { prisma: {
    $transaction: async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      return live.$transaction(async (tx) => {
        const officer = await tx.users.findFirst({ where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' }, select: { id: true } });
        if (!officer) throw new Error('Development Security Officer required');
        const [clock] = await tx.$queryRaw<Array<{ at: Date }>>`SELECT transaction_timestamp() AS at`;
        if (!clock) throw new Error('Database clock unavailable');
        for (const id of [state.assetId, state.dependentId]) await tx.assets.create({ data: {
          id, asset_code: `TEST-ARCHIVE-${id}`, name: 'Temporary archive verification', asset_type: 'SERVER', criticality: 'low', data_classification: 'internal', created_by: officer.id,
          created_at: clock.at, updated_at: clock.at,
        } });
        if (state.blocked) await tx.asset_dependencies.create({ data: { asset_id: state.dependentId, depends_on_asset_id: state.assetId } });
        // The repository rechecks this authenticated fixture officer inside its transaction.
        const actor = await tx.users.findUnique({ where: { id: officer.id }, select: { role: true, status: true } });
        expect(actor?.role).toBe('SECURITY_OFFICER');
        const result = await work(tx);
        expect(result).toMatchObject({ kind: state.blocked ? 'dependencies' : 'updated' });
        const saved = await tx.assets.findUnique({ where: { id: state.assetId }, select: { status: true, archived_by: true, archive_reason: true } });
        expect(saved?.status).toBe(state.blocked ? 'ACTIVE' : 'ARCHIVED');
        const audits = await tx.audit_logs.findMany({ where: { resource_id: state.assetId, action: 'ASSET_ARCHIVED' }, select: { actor_user_id: true, after_data: true } });
        expect(audits).toHaveLength(state.blocked ? 0 : 1);
        if (!state.blocked) {
          expect(saved?.archive_reason).toBe('Temporary test retirement');
          expect(saved?.archived_by).toBe(officer.id);
          expect(audits[0]?.actor_user_id).toBe(officer.id);
        }
        throw new Error('ROLLBACK_ARCHIVE_VERIFICATION');
      }, { isolationLevel: 'Serializable', timeout: 30000, maxWait: 5000 });
    },
  } };
});
import { assetsRepository } from '../src/modules/it-asset-management/assets.repository.js';

const { prisma: live } = await vi.importActual<{ prisma: PrismaClient }>('../src/database/prisma.js');
afterAll(async () => live.$disconnect());
describe('live archive rollback verification', () => {
  it.each([false, true])('validates real metadata/audit and dependency blocking (%s)', async (blocked) => {
    if (process.env.RUN_LIVE_ASSET_TESTS !== '1') throw new Error('Explicit development test opt-in required');
    state.blocked = blocked;
    state.assetId = randomUUID(); state.dependentId = randomUUID();
    const officer = await live.users.findFirst({ where: { role: 'SECURITY_OFFICER', status: 'ACTIVE' }, select: { id: true } });
    if (!officer) throw new Error('Development Security Officer required');
    await expect(assetsRepository.archive(state.assetId, officer.id, 'Temporary test retirement', 'archive-live-test')).rejects.toThrow('ROLLBACK_ARCHIVE_VERIFICATION');
    expect(await live.assets.count({ where: { id: { in: [state.assetId, state.dependentId] } } })).toBe(0);
    expect(await live.audit_logs.count({ where: { resource_id: state.assetId } })).toBe(0);
  });
});

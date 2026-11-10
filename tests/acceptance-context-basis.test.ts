import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(), risk_assets: { findMany: vi.fn() }, control_evidence_links: { findMany: vi.fn() },
}));
vi.mock('../src/database/prisma.js', () => ({ prisma: db }));
import { prisma } from '../src/database/prisma.js';
import { readAcceptanceContextBasis, acceptanceContextBlockedReason } from '../src/modules/risk-assessment/acceptance-context-basis.js';
const date = new Date('2026-11-09T10:00:00Z');
const asset = { asset_id: 'asset', assets: { id: 'asset', criticality: 'medium', data_classification: 'confidential', classified_at: date, business_service_id: 'service',
  asset_dependencies_asset_dependencies_asset_idToassets: [], asset_event_sources: [],
} };
const evidence = { control_id: 'control', evidence_id: 'evidence', linked_at: date, evidence_items: {
  id: 'evidence', status: 'ACTIVE', collected_at: date, valid_from: null, valid_until: new Date('2026-11-10T00:00:00Z'),
  storage_uri: 'https://example.test/evidence', integrity_hash: 'original-digest', file_size: 100n,
} };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(date);
  db.risk_assets.findMany.mockResolvedValue([asset]);
  db.control_evidence_links.findMany.mockResolvedValue([evidence]);
});
afterEach(() => vi.useRealTimers());

it('preserves a deterministic snapshot, including BigInt sizes, and locks rows before reading', async () => {
  const basis = await readAcceptanceContextBasis(prisma, 'risk', true);
  expect(acceptanceContextBlockedReason(basis, await readAcceptanceContextBasis(prisma, 'risk'))).toBeNull();
  expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  expect(db.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(db.risk_assets.findMany.mock.invocationCallOrder[0] ?? 0);
});
it.each([
  { criticality: 'critical' }, { data_classification: 'restricted' }, { classified_at: new Date('2026-11-09T11:00:00Z') },
  { business_service_id: 'different-service' },
  { asset_dependencies_asset_dependencies_asset_idToassets: [{ depends_on_asset_id: 'dependency' }] },
  { asset_event_sources: [{ event_source_id: 'source' }] },
])('blocks changed Asset classification/context: %j', async (change) => {
  const submitted = await readAcceptanceContextBasis(prisma, 'risk');
  db.risk_assets.findMany.mockResolvedValue([{ ...asset, assets: { ...asset.assets, ...change } }]);
  expect(acceptanceContextBlockedReason(submitted, await readAcceptanceContextBasis(prisma, 'risk'))).toMatch(/Asset classification or context changed/);
});
it.each([
  { status: 'REVOKED' }, { storage_uri: 'https://example.test/replacement' }, { integrity_hash: 'replacement-digest' },
  { collected_at: new Date('2026-11-08') }, { valid_until: new Date('2026-11-20') }, { file_size: 101n },
])('blocks changed Evidence metadata even when its ID remains the same', async (change) => {
  const submitted = await readAcceptanceContextBasis(prisma, 'risk');
  db.control_evidence_links.findMany.mockResolvedValue([{ ...evidence, evidence_items: { ...evidence.evidence_items, ...change } }]);
  expect(acceptanceContextBlockedReason(submitted, await readAcceptanceContextBasis(prisma, 'risk'))).toMatch(/Evidence or its Control links changed/);
});
it('detects evidence expiry even if no row was edited and another Evidence remains usable', async () => {
  db.control_evidence_links.findMany.mockResolvedValue([evidence, { ...evidence, evidence_id: 'second', evidence_items: { ...evidence.evidence_items, id: 'second', valid_until: null } }]);
  const submitted = await readAcceptanceContextBasis(prisma, 'risk');
  vi.setSystemTime(new Date('2026-11-11'));
  expect(acceptanceContextBlockedReason(submitted, await readAcceptanceContextBasis(prisma, 'risk'))).toMatch(/Evidence/);
});
it('blocks deleted or replaced Evidence links', async () => {
  const submitted = await readAcceptanceContextBasis(prisma, 'risk');
  db.control_evidence_links.findMany.mockResolvedValue([]);
  expect(acceptanceContextBlockedReason(submitted, await readAcceptanceContextBasis(prisma, 'risk'))).toMatch(/Evidence/);
});
it('requires legacy requests to be rejected and resubmitted without inventing a snapshot', async () => {
  expect(acceptanceContextBlockedReason(undefined, await readAcceptanceContextBasis(prisma, 'risk'))).toMatch(/no verifiable/);
});

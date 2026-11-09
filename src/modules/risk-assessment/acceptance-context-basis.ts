import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';

const basisSchema = z.object({
  version: z.literal(1),
  assetHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AcceptanceContextBasis = z.infer<typeof basisSchema>;

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

/** Acquire after the Risk and Control locks, before reading any validation data. */
export async function lockAcceptanceContextSources(database: Prisma.TransactionClient, riskId: string): Promise<void> {
    await database.$queryRaw`SELECT asset.id FROM assets AS asset
      JOIN risk_assets AS link ON link.asset_id = asset.id
      WHERE link.risk_id = ${riskId}::uuid ORDER BY asset.id FOR SHARE OF asset`;
    await database.$queryRaw`SELECT evidence.id FROM evidence_items AS evidence
      WHERE EXISTS (SELECT 1 FROM control_evidence_links AS link
        JOIN control_risk_links AS risk_link ON risk_link.control_id = link.control_id
        WHERE risk_link.risk_id = ${riskId}::uuid AND link.evidence_id = evidence.id)
      ORDER BY evidence.id FOR SHARE OF evidence`;
}

export async function readAcceptanceContextBasis(
  database: Prisma.TransactionClient,
  riskId: string,
  lock = false,
): Promise<AcceptanceContextBasis> {
  if (lock) await lockAcceptanceContextSources(database, riskId);
  const assets = await database.risk_assets.findMany({
    where: { risk_id: riskId }, orderBy: { asset_id: 'asc' },
    select: { asset_id: true, assets: { select: {
      id: true, name: true, asset_type: true, status: true, owner_user_id: true,
      criticality: true, data_classification: true, classified_at: true, classified_by: true,
      classification_confidentiality_impact: true, classification_integrity_impact: true,
      classification_availability_impact: true, classification_business_impact: true,
      classification_rationale: true, data_classification_basis: true,
      classification_method_version: true, data_classification_method_version: true,
      description: true, updated_at: true, business_service_id: true,
      asset_dependencies_asset_dependencies_asset_idToassets: {
        orderBy: { depends_on_asset_id: 'asc' },
        select: { depends_on_asset_id: true, dependency_type: true, description: true, created_at: true },
      },
      asset_event_sources: { orderBy: { event_source_id: 'asc' }, select: { event_source_id: true, created_at: true } },
    } } },
  });
  const evidence = await database.control_evidence_links.findMany({
    where: { security_controls: { control_risk_links: { some: { risk_id: riskId } } } },
    orderBy: [{ control_id: 'asc' }, { evidence_id: 'asc' }],
    select: { control_id: true, evidence_id: true, linked_at: true, linked_by: true, evidence_items: { select: {
      id: true, name: true, description: true, source: true, owner_user_id: true,
      status: true, collected_at: true, valid_from: true, valid_until: true,
      evidence_type: true, storage_uri: true, integrity_hash: true,
      original_file_name: true, mime_type: true, file_size: true,
      reviewed_by: true, reviewed_at: true,
    } } },
  });
  const now = new Date();
  return { version: 1, assetHash: digest(assets), evidenceHash: digest(evidence.map((link) => ({
    ...link,
    usableNow: link.evidence_items.status === 'ACTIVE' &&
      (!link.evidence_items.valid_from || link.evidence_items.valid_from <= now) &&
      (!link.evidence_items.valid_until || link.evidence_items.valid_until > now),
  }))) };
}

export function acceptanceContextBlockedReason(value: unknown, current: AcceptanceContextBasis): string | null {
  const parsed = basisSchema.safeParse(value);
  if (!parsed.success)
    return 'This request has no verifiable Asset/Evidence snapshot. Reject it and submit a new acceptance request.';
  if (parsed.data.assetHash !== current.assetHash)
    return 'Asset classification or context changed after submission. Reject this request, reassess the Risk, and submit a new acceptance request.';
  if (parsed.data.evidenceHash !== current.evidenceHash)
    return 'Evidence or its Control links changed after submission. Reject this request, review the Evidence and assessments, and submit a new acceptance request.';
  return null;
}

import type { Prisma } from '@prisma/client';
import type {
  AssetDetailRecord,
  AssetHistoryRecord,
  AssetListRecord,
} from './asset-management.repository.js';

export type AssetListItem = {
  id: string;
  assetCode: string;
  name: string;
  assetType: string;
  criticality: string;
  status: string;
  location: string | null;
  department: { id: string; code: string; name: string } | null;
  owner: { id: string; fullName: string } | null;
  updatedAt: Date;
};

export const toAssetListItem = (asset: AssetListRecord): AssetListItem => ({
  id: asset.asset_id,
  assetCode: asset.asset_code,
  name: asset.name,
  assetType: asset.asset_type,
  criticality: asset.criticality,
  status: asset.status,
  location: asset.location,
  department: asset.departments
    ? {
        id: asset.departments.department_id,
        code: asset.departments.code,
        name: asset.departments.name,
      }
    : null,
  owner: asset.users_assets_owner_user_idTousers
    ? {
        id: asset.users_assets_owner_user_idTousers.user_id,
        fullName: asset.users_assets_owner_user_idTousers.full_name,
      }
    : null,
  updatedAt: asset.updated_at,
});

export type AssetDetail = AssetListItem & {
  description: string | null;
  hostname: string | null;
  ipAddress: string | null;
  metadata: Prisma.JsonValue;
  retiredAt: Date | null;
  createdAt: Date;
};

export const toAssetDetail = (asset: AssetDetailRecord): AssetDetail => ({
  ...toAssetListItem(asset),
  description: asset.description,
  hostname: asset.hostname,
  ipAddress: asset.ip_address,
  metadata: asset.metadata,
  retiredAt: asset.retired_at,
  createdAt: asset.created_at,
});

const historyFields = new Set([
  'assetCode',
  'name',
  'assetType',
  'description',
  'departmentId',
  'ownerUserId',
  'criticality',
  'hostname',
  'ipAddress',
  'location',
  'status',
  'metadata',
  'retiredAt',
  'reason',
  'score',
  'criteria',
  'changed',
  'source',
  'importJobId',
  'rowNumber',
]);
const sensitiveKey = /password|token|secret|authorization|credential|private.?key/i;

const redactNestedValue = (value: Prisma.JsonValue | undefined): unknown => {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(redactNestedValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKey.test(key))
        .map(([key, nested]) => [key, redactNestedValue(nested)]),
    );
  }
  return value;
};

export const sanitizeAssetHistoryData = (
  value: Prisma.JsonValue | undefined,
): Record<string, unknown> | null => {
  if (value === null || Array.isArray(value) || typeof value !== 'object') return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => historyFields.has(key) && !sensitiveKey.test(key))
      .map(([key, nested]) => [key, redactNestedValue(nested)]),
  );
};

export const toAssetHistoryItem = (history: AssetHistoryRecord) => ({
  id: history.asset_change_history_id,
  action: history.action,
  changedBy:
    history.users && history.users.deleted_at === null
      ? { id: history.users.user_id, fullName: history.users.full_name }
      : null,
  before: sanitizeAssetHistoryData(history.before_data),
  after: sanitizeAssetHistoryData(history.after_data),
  changedAt: history.changed_at,
});

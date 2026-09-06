import type { AssetListRecord } from './asset-management.repository.js';

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

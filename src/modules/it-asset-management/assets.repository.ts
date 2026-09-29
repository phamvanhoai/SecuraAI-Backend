import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import type { ListAssetsQuery } from './dto/list-assets.dto.js';
const select = { id: true, asset_code: true, name: true, asset_type: true, criticality: true, data_classification: true, description: true, status: true, owner_user_id: true, created_at: true, updated_at: true, users_assets_owner_user_idTousers: { select: { id: true, full_name: true, status: true } }, business_services: { select: { id: true, name: true, status: true } } } as const;
function where(query: ListAssetsQuery): Prisma.assetsWhereInput { return { ...(query.status ? { status: query.status.toUpperCase() as 'ACTIVE' | 'ARCHIVED' } : {}), ...(query.assetType ? { asset_type: { equals: query.assetType, mode: 'insensitive' } } : {}), ...(query.criticality ? { criticality: { equals: query.criticality, mode: 'insensitive' } } : {}), ...(query.ownerUserId ? { owner_user_id: query.ownerUserId } : {}), ...(query.businessServiceId ? { business_service_id: query.businessServiceId } : {}), ...(query.q ? { OR: [{ asset_code: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }, { asset_type: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }, { users_assets_owner_user_idTousers: { full_name: { contains: query.q, mode: 'insensitive' } } }, { business_services: { name: { contains: query.q, mode: 'insensitive' } } }] } : {}) }; }
function orderBy(query: ListAssetsQuery): Prisma.assetsOrderByWithRelationInput[] { const field = { assetCode: 'asset_code', name: 'name', assetType: 'asset_type', criticality: 'criticality', createdAt: 'created_at', updatedAt: 'updated_at' }[query.sortBy] as 'asset_code' | 'name' | 'asset_type' | 'criticality' | 'created_at' | 'updated_at'; return [{ [field]: query.sortOrder }, { id: query.sortOrder }]; }
export const assetsRepository = {
  findActor(userId: string) { return prisma.users.findUnique({ where: { id: userId }, select: { role: true, status: true } }); },
  list(query: ListAssetsQuery) { const filters = where(query); return prisma.$transaction([prisma.assets.count({ where: filters }), prisma.assets.findMany({ where: filters, select, orderBy: orderBy(query), skip: (query.page - 1) * query.limit, take: query.limit })]); },
  findById(assetId: string) { return prisma.assets.findUnique({ where: { id: assetId }, select: {
    ...select, archived_at: true,
    users_assets_created_byTousers: { select: { id: true, full_name: true, status: true } },
    asset_dependencies_asset_dependencies_asset_idToassets: { select: { id: true, dependency_type: true, description: true, assets_asset_dependencies_depends_on_asset_idToassets: { select: { id: true, asset_code: true, name: true, status: true } } } },
    control_asset_links: { select: { security_controls: { select: { id: true, control_code: true, name: true, implementation_status: true } } } },
    asset_event_sources: { select: { event_sources: { select: { id: true, name: true, source_type: true, status: true } } } },
    risk_assets: { select: { risks: { select: { id: true, risk_code: true, title: true, status: true } } } },
    incident_assets: { select: { incidents: { select: { id: true, incident_code: true, title: true, severity: true, status: true } } } },
  } }); },
};

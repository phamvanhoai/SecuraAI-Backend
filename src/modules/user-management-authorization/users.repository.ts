import { prisma } from '../../database/prisma.js';
import type { CreateUserBody } from './dto/create-user.dto.js';
import type { ListUsersQuery } from './dto/list-users-query.dto.js';
import type { UpdateUserBody } from './dto/update-user.dto.js';
import type { AssignUserAccessBody } from './dto/assign-user-access.dto.js';

const userDetailSelect = {
  id: true,
  email: true,
  username: true,
  full_name: true,
  phone: true,
  employee_code: true,
  department_id: true,
  departments: { select: { id: true, code: true, name: true } },
  role: true,
  status: true,
  google_subject: true,
  last_login_at: true,
  password_changed_at: true,
  created_at: true,
  updated_at: true,
} as const;

function findActor(actorUserId: string) {
  return prisma.users.findUnique({
    where: { id: actorUserId },
    select: { role: true, status: true },
  });
}

export const usersRepository = {
  async getUserAccessAssignmentOptions(actorUserId: string) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
    const [businessServices, assets] = await Promise.all([
      prisma.business_services.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, owner_user_id: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
      prisma.assets.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, asset_code: true, name: true, owner_user_id: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: 200,
      }),
    ]);
    return {
      kind: 'found',
      businessServices: businessServices.map((item) => ({
        id: item.id,
        name: item.name,
        ownerUserId: item.owner_user_id,
      })),
      assets: assets.map((item) => ({
        id: item.id,
        code: item.asset_code,
        name: item.name,
        ownerUserId: item.owner_user_id,
      })),
    } as const;
  },
  async getUserAccessAssignment(actorUserId: string, userId: string) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, full_name: true, email: true, role: true, status: true },
    });
    if (!user) return { kind: 'not_found' } as const;
    const [
      scopes,
      businessServices,
      assets,
      risks,
      treatmentPlans,
      treatmentActions,
      securityControls,
      evidenceItems,
      policies,
    ] = await Promise.all([
      prisma.user_access_scopes.findMany({
        where: { user_id: userId },
        select: {
          id: true,
          scope_code: true,
          business_service_id: true,
          asset_id: true,
          assigned_at: true,
          expires_at: true,
        },
        orderBy: [{ scope_code: 'asc' }, { assigned_at: 'asc' }],
      }),
      prisma.business_services.count({ where: { owner_user_id: userId } }),
      prisma.assets.count({ where: { owner_user_id: userId } }),
      prisma.risks.count({ where: { owner_user_id: userId } }),
      prisma.risk_treatment_plans.count({ where: { owner_user_id: userId } }),
      prisma.risk_treatment_actions.count({ where: { owner_user_id: userId } }),
      prisma.security_controls.count({ where: { owner_user_id: userId } }),
      prisma.evidence_items.count({ where: { owner_user_id: userId } }),
      prisma.policies.count({ where: { owner_user_id: userId } }),
    ]);
    return {
      kind: 'found',
      user,
      scopes,
      ownershipSummary: {
        businessServices,
        assets,
        risks,
        treatmentPlans,
        treatmentActions,
        securityControls,
        evidenceItems,
        policies,
      },
    } as const;
  },
  assignUserAccess(actorUserId: string, userId: string, input: AssignUserAccessBody) {
    return prisma.$transaction(
      async (transaction) => {
        const actor = await transaction.users.findUnique({
          where: { id: actorUserId },
          select: { id: true, role: true, status: true },
        });
        if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
        if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
        const user = await transaction.users.findUnique({
          where: { id: userId },
          select: { id: true, role: true, status: true },
        });
        if (!user) return { kind: 'not_found' } as const;
        if (actorUserId === userId && input.role !== user.role)
          return { kind: 'self_role_change' } as const;
        if (user.role === 'ADMIN' && input.role !== 'ADMIN') {
          const activeAdmins = await transaction.users.count({
            where: { role: 'ADMIN', status: 'ACTIVE' },
          });
          if (activeAdmins <= 1) return { kind: 'last_admin' } as const;
        }

        const businessServiceIds = input.scopes.flatMap((scope) =>
          scope.targetType === 'BUSINESS_SERVICE' ? [scope.targetId] : [],
        );
        const assetIds = input.scopes.flatMap((scope) =>
          scope.targetType === 'ASSET' ? [scope.targetId] : [],
        );
        const [businessServiceCount, assetCount] = await Promise.all([
          transaction.business_services.count({
            where: { id: { in: businessServiceIds }, status: 'ACTIVE' },
          }),
          transaction.assets.count({ where: { id: { in: assetIds }, status: 'ACTIVE' } }),
        ]);
        const uniqueBusinessServiceIds = new Set(businessServiceIds);
        const uniqueAssetIds = new Set(assetIds);
        if (
          businessServiceCount !== uniqueBusinessServiceIds.size ||
          assetCount !== uniqueAssetIds.size
        ) {
          return { kind: 'invalid_scope_target' } as const;
        }

        const beforeScopes = await transaction.user_access_scopes.findMany({
          where: { user_id: userId },
          select: { scope_code: true, business_service_id: true, asset_id: true, expires_at: true },
        });
        await transaction.user_access_scopes.deleteMany({ where: { user_id: userId } });
        if (input.scopes.length > 0) {
          await transaction.user_access_scopes.createMany({
            data: input.scopes.map((scope) => ({
              user_id: userId,
              scope_code: scope.scopeCode,
              assigned_by: actor.id,
              expires_at: scope.expiresAt ? new Date(scope.expiresAt) : null,
              ...(scope.targetType === 'BUSINESS_SERVICE'
                ? { business_service_id: scope.targetId }
                : {}),
              ...(scope.targetType === 'ASSET' ? { asset_id: scope.targetId } : {}),
            })),
          });
        }
        const updated = await transaction.users.update({
          where: { id: userId },
          data: { role: input.role },
          select: { id: true, role: true },
        });
        const previousScopeKeys = beforeScopes
          .map(
            (scope) =>
              `${scope.scope_code}:${scope.business_service_id ?? ''}:${scope.asset_id ?? ''}:${scope.expires_at?.toISOString() ?? ''}`,
          )
          .sort();
        const requestedScopeKeys = input.scopes
          .map(
            (scope) =>
              `${scope.scopeCode}:${scope.targetType === 'BUSINESS_SERVICE' ? scope.targetId : ''}:${scope.targetType === 'ASSET' ? scope.targetId : ''}:${scope.expiresAt ?? ''}`,
          )
          .sort();
        const changed =
          user.role !== input.role ||
          JSON.stringify(previousScopeKeys) !== JSON.stringify(requestedScopeKeys);
        if (user.role !== input.role) {
          await transaction.auth_sessions.updateMany({
            where: { user_id: userId, revoked_at: null },
            data: { revoked_at: new Date() },
          });
        }
        await transaction.audit_logs.create({
          data: {
            actor_user_id: actor.id,
            actor_type: 'USER',
            action: 'USER_ACCESS_ASSIGNED',
            resource_type: 'USER',
            resource_id: userId,
            source: 'API',
            before_data: {
              role: user.role,
              scopes: beforeScopes,
            },
            after_data: input,
            record_hash: `USER_ACCESS_ASSIGNED:${userId}:${actor.id}:${Date.now()}`,
          },
        });
        return {
          kind: 'updated',
          changed,
          user: updated,
          scopeCount: input.scopes.length,
        } as const;
      },
      {
        // This authorization update performs several dependent reads and writes.
        // Supabase's remote pooled connection can exceed Prisma's 5-second default
        // interactive-transaction timeout even though every query succeeds.
        maxWait: 5_000,
        timeout: 20_000,
      },
    );
  },
  async listDepartments(actorUserId: string) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
    const departments = await prisma.departments.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return { kind: 'found', departments } as const;
  },
  async getUserById(actorUserId: string, userId: string) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: userDetailSelect,
    });
    if (!user) return { kind: 'not_found' } as const;
    return { kind: 'found', user } as const;
  },
  updateUser(actorUserId: string, userId: string, input: UpdateUserBody) {
    return prisma.$transaction(async (transaction) => {
      const actor = await transaction.users.findUnique({
        where: { id: actorUserId },
        select: { id: true, role: true, status: true },
      });
      if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
      if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;

      const existing = await transaction.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          full_name: true,
          phone: true,
          employee_code: true,
          department_id: true,
          status: true,
        },
      });
      if (!existing) return { kind: 'not_found' } as const;
      if (input.departmentId) {
        const department = await transaction.departments.findFirst({
          where: { id: input.departmentId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!department) return { kind: 'invalid_department' } as const;
      }

      const user = await transaction.users.update({
        where: { id: userId },
        data: {
          full_name: input.fullName,
          phone: input.phone,
          employee_code: input.employeeCode,
          department_id: input.departmentId,
          status: input.status,
        },
        select: userDetailSelect,
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: actor.id,
          actor_type: 'USER',
          action: 'USER_UPDATED',
          resource_type: 'USER',
          resource_id: user.id,
          source: 'API',
          before_data: {
            fullName: existing.full_name,
            phone: existing.phone,
            employeeCode: existing.employee_code,
            departmentId: existing.department_id,
            status: existing.status,
          },
          after_data: {
            fullName: user.full_name,
            phone: user.phone,
            employeeCode: user.employee_code,
            departmentId: user.department_id,
            status: user.status,
          },
          record_hash: `USER_UPDATED:${user.id}:${actor.id}:${user.updated_at.toISOString()}`,
        },
      });
      return { kind: 'updated', user } as const;
    });
  },
  async listUsers(actorUserId: string, query: ListUsersQuery) {
    const actor = await findActor(actorUserId);
    if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
    if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;

    const where = {
      ...(query.q
        ? {
            OR: [
              { full_name: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { username: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.roleCode ? { role: query.roleCode } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.departmentId ? { department_id: query.departmentId } : {}),
    };
    const [items, total, statusCounts] = await Promise.all([
      prisma.users.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          email: true,
          username: true,
          full_name: true,
          employee_code: true,
          departments: { select: { id: true, code: true, name: true } },
          role: true,
          status: true,
          created_at: true,
        },
      }),
      prisma.users.count({ where }),
      prisma.users.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return { kind: 'found', items, total, statusCounts } as const;
  },
  findCurrentUser(userId: string) {
    return prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
      },
    });
  },
  createUser(
    input: CreateUserBody & { actorUserId: string; username: string; passwordHash: string },
  ) {
    return prisma.$transaction(async (transaction) => {
      const actor = await transaction.users.findUnique({
        where: { id: input.actorUserId },
        select: { id: true, role: true, status: true },
      });
      if (!actor || actor.status !== 'ACTIVE') return { kind: 'unauthorized' } as const;
      if (actor.role !== 'ADMIN') return { kind: 'forbidden' } as const;
      if (input.departmentId) {
        const department = await transaction.departments.findFirst({
          where: { id: input.departmentId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!department) return { kind: 'invalid_department' } as const;
      }

      const user = await transaction.users.create({
        data: {
          email: input.email,
          username: input.username,
          password_hash: input.passwordHash,
          full_name: input.fullName,
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.employeeCode !== undefined ? { employee_code: input.employeeCode } : {}),
          ...(input.departmentId !== undefined
            ? { departments: { connect: { id: input.departmentId } } }
            : {}),
          role: input.role,
        },
        select: {
          id: true,
          email: true,
          username: true,
          full_name: true,
          role: true,
          status: true,
        },
      });
      await transaction.audit_logs.create({
        data: {
          actor_user_id: actor.id,
          actor_type: 'USER',
          action: 'USER_CREATED',
          resource_type: 'USER',
          resource_id: user.id,
          source: 'API',
          after_data: {
            email: user.email,
            username: user.username,
            role: user.role,
            status: user.status,
          },
          record_hash: `USER_CREATED:${user.id}:${actor.id}`,
        },
      });
      return { kind: 'created', user } as const;
    });
  },
  deleteProvisionedUser(userId: string) {
    return prisma.$transaction([
      prisma.audit_logs.deleteMany({
        where: { resource_type: 'USER', resource_id: userId, action: 'USER_CREATED' },
      }),
      prisma.users.delete({ where: { id: userId } }),
    ]);
  },
};

import type { RequestHandler } from 'express';
import { z } from 'zod';
import { accessControlService } from './access-control.service.js';
import { listPermissionsQuerySchema } from './dto/permission.dto.js';
import {
  configureRolePermissionsBodySchema,
  configureUserPermissionsBodySchema,
  listRolesQuerySchema,
  roleParamsSchema,
  userPermissionParamsSchema,
} from './dto/role-permissions.dto.js';

const userIdSchema = z.uuid();
function actorUserId(value: unknown): string {
  return userIdSchema.parse(value);
}

export const listPermissions: RequestHandler = async (req, res) => {
  const data = await accessControlService.listPermissions(
    actorUserId(res.locals.authenticatedUserId),
    listPermissionsQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const listRoles: RequestHandler = async (req, res) => {
  const data = await accessControlService.listRoles(
    actorUserId(res.locals.authenticatedUserId),
    listRolesQuerySchema.parse(req.query),
  );
  res.status(200).json({ success: true, data });
};

export const getRole: RequestHandler = async (req, res) => {
  const { roleId } = roleParamsSchema.parse(req.params);
  const data = await accessControlService.getRole(
    actorUserId(res.locals.authenticatedUserId),
    roleId,
  );
  res.status(200).json({ success: true, data });
};

export const configureRolePermissions: RequestHandler = async (req, res) => {
  const { roleId } = roleParamsSchema.parse(req.params);
  const data = await accessControlService.configureRolePermissions(
    actorUserId(res.locals.authenticatedUserId),
    roleId,
    configureRolePermissionsBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

export const getUserPermissions: RequestHandler = async (req, res) => {
  const { userId } = userPermissionParamsSchema.parse(req.params);
  const data = await accessControlService.getUserPermissions(
    actorUserId(res.locals.authenticatedUserId),
    userId,
  );
  res.status(200).json({ success: true, data });
};

export const configureUserPermissions: RequestHandler = async (req, res) => {
  const { userId } = userPermissionParamsSchema.parse(req.params);
  const data = await accessControlService.configureUserPermissions(
    actorUserId(res.locals.authenticatedUserId),
    userId,
    configureUserPermissionsBodySchema.parse(req.body),
  );
  res.status(200).json({ success: true, data });
};

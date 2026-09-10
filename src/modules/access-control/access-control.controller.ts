import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { accessControlService } from './access-control.service.js';
import { listPermissionsQuerySchema } from './dto/permission.dto.js';
import {
  createRoleBodySchema,
  listRolesQuerySchema,
  roleParamsSchema,
  updateRoleBodySchema,
} from './dto/role.dto.js';

const actor = (req: Parameters<RequestHandler>[0]) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth;
};
export const listPermissions: RequestHandler = async (req, res) => {
  const data = await accessControlService.listPermissions(
    listPermissionsQuerySchema.parse(req.query),
    actor(req),
  );
  res.status(200).json({ success: true, data });
};
export const listRoles: RequestHandler = async (req, res) => {
  const data = await accessControlService.listRoles(
    listRolesQuerySchema.parse(req.query),
    actor(req),
  );
  res.status(200).json({ success: true, data });
};
export const getRole: RequestHandler = async (req, res) => {
  const { roleId } = roleParamsSchema.parse(req.params);
  const data = await accessControlService.getRole(roleId, actor(req));
  res.status(200).json({ success: true, data });
};
export const createRole: RequestHandler = async (req, res) => {
  const data = await accessControlService.createRole(
    createRoleBodySchema.parse(req.body),
    actor(req),
  );
  res.status(201).json({ success: true, data });
};
export const updateRole: RequestHandler = async (req, res) => {
  const { roleId } = roleParamsSchema.parse(req.params);
  const data = await accessControlService.updateRole(
    roleId,
    updateRoleBodySchema.parse(req.body),
    actor(req),
  );
  res.status(200).json({ success: true, data });
};
export const deleteRole: RequestHandler = async (req, res) => {
  const { roleId } = roleParamsSchema.parse(req.params);
  await accessControlService.deleteRole(roleId, actor(req));
  res.status(204).send();
};
export const accessControlController = {
  listPermissions,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
} as const;

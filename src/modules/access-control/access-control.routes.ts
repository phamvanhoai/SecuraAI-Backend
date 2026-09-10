import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  createRole,
  deleteRole,
  getRole,
  listPermissions,
  listRoles,
  updateRole,
} from './access-control.controller.js';
import { listPermissionsQuerySchema } from './dto/permission.dto.js';
import {
  createRoleBodySchema,
  listRolesQuerySchema,
  roleParamsSchema,
  updateRoleBodySchema,
} from './dto/role.dto.js';

export const accessControlRouter = Router();
accessControlRouter.get(
  '/permissions',
  authenticate,
  authorize('roles.read'),
  validate({ query: listPermissionsQuerySchema }),
  asyncHandler(listPermissions),
);
accessControlRouter.get(
  '/roles',
  authenticate,
  authorize('roles.read'),
  validate({ query: listRolesQuerySchema }),
  asyncHandler(listRoles),
);
accessControlRouter.get(
  '/roles/:roleId',
  authenticate,
  authorize('roles.read'),
  validate({ params: roleParamsSchema }),
  asyncHandler(getRole),
);
accessControlRouter.post(
  '/roles',
  authenticate,
  authorize('roles.create'),
  validate({ body: createRoleBodySchema }),
  asyncHandler(createRole),
);
accessControlRouter.patch(
  '/roles/:roleId',
  authenticate,
  authorize('roles.update'),
  validate({ params: roleParamsSchema, body: updateRoleBodySchema }),
  asyncHandler(updateRole),
);
accessControlRouter.delete(
  '/roles/:roleId',
  authenticate,
  authorize('roles.delete'),
  validate({ params: roleParamsSchema }),
  asyncHandler(deleteRole),
);

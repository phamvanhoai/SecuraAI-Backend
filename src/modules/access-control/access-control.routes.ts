import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { authorizePermission } from '../../common/middleware/authorize-permission.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import {
  configureRolePermissions,
  configureUserPermissions,
  getRole,
  getUserPermissions,
  listPermissions,
  listRoles,
} from './access-control.controller.js';
import { listPermissionsQuerySchema } from './dto/permission.dto.js';
import {
  configureRolePermissionsBodySchema,
  configureUserPermissionsBodySchema,
  listRolesQuerySchema,
  roleParamsSchema,
  userPermissionParamsSchema,
} from './dto/role-permissions.dto.js';

export const accessControlRouter = Router();
accessControlRouter.get(
  '/permissions',
  authenticate,
  authorizePermission('roles.read'),
  validate({ query: listPermissionsQuerySchema }),
  asyncHandler(listPermissions),
);
accessControlRouter.get(
  '/roles',
  authenticate,
  authorizePermission('roles.read'),
  validate({ query: listRolesQuerySchema }),
  asyncHandler(listRoles),
);
accessControlRouter.get(
  '/roles/:roleId',
  authenticate,
  authorizePermission('roles.read'),
  validate({ params: roleParamsSchema }),
  asyncHandler(getRole),
);
accessControlRouter.put(
  '/roles/:roleId/permissions',
  authenticate,
  authorizePermission('roles.update'),
  validate({ params: roleParamsSchema, body: configureRolePermissionsBodySchema }),
  asyncHandler(configureRolePermissions),
);
accessControlRouter.get(
  '/users/:userId/permissions',
  authenticate,
  authorizePermission('roles.read'),
  validate({ params: userPermissionParamsSchema }),
  asyncHandler(getUserPermissions),
);
accessControlRouter.put(
  '/users/:userId/permissions',
  authenticate,
  authorizePermission('roles.update'),
  validate({ params: userPermissionParamsSchema, body: configureUserPermissionsBodySchema }),
  asyncHandler(configureUserPermissions),
);

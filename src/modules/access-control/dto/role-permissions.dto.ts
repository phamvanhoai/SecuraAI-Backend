import { z } from 'zod';

export const roleParamsSchema = z.object({ roleId: z.uuid() }).strict();
export const userPermissionParamsSchema = z.object({ userId: z.uuid() }).strict();
export const listRolesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['code', 'name', 'updatedAt']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

const permissionIdsSchema = z
  .array(z.uuid())
  .max(200)
  .refine((codes) => new Set(codes).size === codes.length, 'Permission codes must be unique');

export const configureRolePermissionsBodySchema = z
  .object({
    permissionIds: permissionIdsSchema,
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict();

export const configureUserPermissionsBodySchema = z
  .object({
    allow: permissionIdsSchema,
    deny: permissionIdsSchema,
    reason: z.string().trim().min(10).max(1000),
  })
  .strict()
  .refine((value) => !value.allow.some((code) => value.deny.includes(code)), {
    message: 'A permission cannot be both allowed and denied',
  });

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
export type ConfigureRolePermissionsBody = z.infer<typeof configureRolePermissionsBodySchema>;
export type ConfigureUserPermissionsBody = z.infer<typeof configureUserPermissionsBodySchema>;

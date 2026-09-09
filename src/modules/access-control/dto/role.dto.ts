import { z } from 'zod';

const roleCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(50)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Role code must use uppercase letters, numbers and underscores');
const permissionIdsSchema = z
  .array(z.uuid())
  .max(200)
  .refine((ids) => new Set(ids).size === ids.length, 'Permission IDs must be unique');

export const roleParamsSchema = z.object({ roleId: z.uuid() }).strict();
export const listRolesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().min(1).max(100).optional(),
    sortBy: z.enum(['code', 'name', 'createdAt', 'updatedAt']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
export const createRoleBodySchema = z
  .object({
    code: roleCodeSchema,
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1000).nullable().optional(),
    permissionIds: permissionIdsSchema.default([]),
  })
  .strict();
export const updateRoleBodySchema = z
  .object({
    code: roleCodeSchema.optional(),
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    permissionIds: permissionIdsSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;
export type UpdateRoleBody = z.infer<typeof updateRoleBodySchema>;

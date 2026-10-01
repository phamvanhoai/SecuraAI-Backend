import { z } from 'zod';
import { isUserAccessScopeCode } from '../user-access-scope-catalog.js';

const scopeCodeSchema = z.string().refine(isUserAccessScopeCode, 'Unsupported access scope code');

const expirationSchema = z.iso.datetime().nullable().optional();

export const userAccessScopeSchema = z.discriminatedUnion('targetType', [
  z
    .object({
      scopeCode: scopeCodeSchema,
      targetType: z.literal('GLOBAL'),
      expiresAt: expirationSchema,
    })
    .strict(),
  z
    .object({
      scopeCode: scopeCodeSchema,
      targetType: z.literal('BUSINESS_SERVICE'),
      targetId: z.uuid(),
      expiresAt: expirationSchema,
    })
    .strict(),
  z
    .object({
      scopeCode: scopeCodeSchema,
      targetType: z.literal('ASSET'),
      targetId: z.uuid(),
      expiresAt: expirationSchema,
    })
    .strict(),
]);

export const assignUserAccessBodySchema = z
  .object({
    role: z.enum(['ADMIN', 'SECURITY_OFFICER', 'EMPLOYEE', 'EXECUTIVE']),
    scopes: z.array(userAccessScopeSchema).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const keys = value.scopes.map(
      (scope) =>
        `${scope.scopeCode}:${scope.targetType}:${'targetId' in scope ? scope.targetId : ''}`,
    );
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        path: ['scopes'],
        message: 'Access scopes must be unique',
      });
    }
    const now = Date.now();
    value.scopes.forEach((scope, index) => {
      if (scope.expiresAt && Date.parse(scope.expiresAt) <= now) {
        context.addIssue({
          code: 'custom',
          path: ['scopes', index, 'expiresAt'],
          message: 'Expiration must be in the future',
        });
      }
    });
  });

export type AssignUserAccessBody = z.infer<typeof assignUserAccessBodySchema>;

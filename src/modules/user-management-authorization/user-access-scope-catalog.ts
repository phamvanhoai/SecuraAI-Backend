export const userAccessScopeCatalog = [
  { code: 'AUDIT_VIEW', name: 'View audit information' },
  { code: 'POLICY_APPROVE', name: 'Approve policies' },
] as const;

export type UserAccessScopeCode = (typeof userAccessScopeCatalog)[number]['code'];

export function isUserAccessScopeCode(value: string): value is UserAccessScopeCode {
  return userAccessScopeCatalog.some(({ code }) => code === value);
}

export const userAccessScopeCatalog = [
  { code: 'RISK_OWNER', name: 'Risk Owner' },
  { code: 'CONTROL_OWNER', name: 'Control Owner' },
  { code: 'ASSET_OWNER', name: 'Asset Owner' },
  { code: 'AUTHORIZED_APPROVER', name: 'Authorized Approver' },
] as const;

export type UserAccessScopeCode = (typeof userAccessScopeCatalog)[number]['code'];

export function isUserAccessScopeCode(value: string): value is UserAccessScopeCode {
  return userAccessScopeCatalog.some(({ code }) => code === value);
}

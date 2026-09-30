import { describe, expect, it } from 'vitest';
import { createUserBodySchema } from '../src/modules/user-management-authorization/dto/create-user.dto.js';
import { updateUserBodySchema } from '../src/modules/user-management-authorization/dto/update-user.dto.js';

describe('V2 user profile validation', () => {
  it('rejects invalid phone and employee-code characters when creating', () => {
    expect(
      createUserBodySchema.safeParse({
        email: 'user@example.com',
        fullName: 'Test User',
        phone: 'phone-number',
        employeeCode: 'EMP 001',
        role: 'EMPLOYEE',
      }).success,
    ).toBe(false);
  });

  it('rejects names containing numbers or special characters', () => {
    expect(
      createUserBodySchema.safeParse({
        email: 'user@example.com',
        fullName: 'User 01!',
        phone: '0901234567',
        role: 'EMPLOYEE',
      }).success,
    ).toBe(false);
  });

  it('accepts supported profile values and statuses when editing', () => {
    expect(
      updateUserBodySchema.safeParse({
        fullName: 'Test User',
        phone: '0901234567',
        employeeCode: 'EMP-001',
        departmentId: null,
        status: 'INACTIVE',
      }).success,
    ).toBe(true);
  });

  it('rejects unsupported statuses', () => {
    expect(
      updateUserBodySchema.safeParse({
        fullName: 'Test User',
        phone: null,
        employeeCode: null,
        departmentId: null,
        status: 'DISABLED',
      }).success,
    ).toBe(false);
  });
});

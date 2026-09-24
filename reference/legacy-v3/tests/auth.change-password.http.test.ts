import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUserForPasswordChange: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('../src/modules/auth/auth.repository.js', () => ({ authRepository: mocks }));

import { createApp } from '../src/app.js';

const accessToken = jwt.sign(
  { type: 'access', roles: ['EMPLOYEE'], permissions: [] },
  'test-secret-with-at-least-thirty-two-characters',
  {
    algorithm: 'HS256',
    subject: '00000000-0000-4000-8000-000000000001',
    issuer: 'securaai-api',
    audience: 'securaai-client',
    expiresIn: '15m',
  },
);

describe('change password HTTP API', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.findUserForPasswordChange.mockResolvedValue({
      password_hash: await argon2.hash('OldPassword1!'),
      status: 'active',
      deleted_at: null,
    });
    mocks.updatePassword.mockResolvedValue(undefined);
  });

  it('changes the password with the current password and matching confirmation', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/change-password')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'OldPassword1!',
        newPassword: 'NewPassword2@',
        confirmPassword: 'NewPassword2@',
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { message: 'Password changed successfully. Please log in again.' },
    });
    expect(mocks.updatePassword).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.any(String),
    );
  });

  it('rejects a wrong current password', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/change-password')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'WrongPassword1!',
        newPassword: 'NewPassword2@',
        confirmPassword: 'NewPassword2@',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(mocks.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects weak or mismatched new passwords', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/change-password')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'OldPassword1!',
        newPassword: 'weakpass',
        confirmPassword: 'different',
      });

    expect(response.status).toBe(422);
    expect(mocks.findUserForPasswordChange).not.toHaveBeenCalled();
  });
});
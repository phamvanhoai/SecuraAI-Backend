import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../src/common/utils/encryption.js';

const mocks = vi.hoisted(() => ({
  findAuthUser: vi.fn(),
  findUserForPasswordChange: vi.fn(),
  findTotpMethod: vi.fn(),
  saveTotpSecret: vi.fn(),
  enableTotpMethod: vi.fn(),
}));

vi.mock('../src/modules/auth/auth.repository.js', () => ({ authRepository: mocks }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    users: { findUnique: mocks.findAuthUser },
    $transaction: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import { generate, generateSecret } from 'otplib';

const userId = '00000000-0000-4000-8000-000000000001';
const accessToken = jwt.sign(
  { type: 'access', roles: ['EMPLOYEE'], permissions: [] },
  'test-secret-with-at-least-thirty-two-characters',
  {
    algorithm: 'HS256',
    subject: userId,
    issuer: 'securaai-api',
    audience: 'securaai-client',
    expiresIn: '15m',
  },
);

describe('TOTP MFA HTTP API', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.findUserForPasswordChange.mockResolvedValue({
      email: 'user@example.com',
      password_hash: await argon2.hash('CurrentPassword1!'),
      status: 'active',
      deleted_at: null,
    });
    mocks.findTotpMethod.mockResolvedValue(null);
    mocks.saveTotpSecret.mockResolvedValue(undefined);
    mocks.enableTotpMethod.mockResolvedValue(undefined);
    mocks.findAuthUser.mockResolvedValue(null);
  });

  it('returns an authenticator URI and QR code during setup', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/mfa/setup')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'CurrentPassword1!' });

    expect(response.status).toBe(200);
    expect(response.body.data.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(response.body.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(mocks.saveTotpSecret).toHaveBeenCalledWith(userId, expect.stringContaining(':'));
  });

  it('verifies a valid authenticator code and enables MFA', async () => {
    const secret = generateSecret();
    mocks.findTotpMethod.mockResolvedValue({
      mfa_method_id: 'mfa-method-id',
      secret_encrypted: encryptSecret(secret),
      is_enabled: false,
    });
    const code = await generate({ secret });

    const response = await request(createApp())
      .post('/api/v1/auth/mfa/verify')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ code });

    expect(response.status).toBe(200);
    expect(response.body.data.message).toContain('MFA enabled successfully');
    expect(mocks.enableTotpMethod).toHaveBeenCalledWith(userId);
  });

  it('rejects an invalid authenticator code', async () => {
    const secret = generateSecret();
    mocks.findTotpMethod.mockResolvedValue({
      mfa_method_id: 'mfa-method-id',
      secret_encrypted: encryptSecret(secret),
      is_enabled: false,
    });

    const response = await request(createApp())
      .post('/api/v1/auth/mfa/verify')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ code: '000000' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MFA_CODE');
    expect(mocks.enableTotpMethod).not.toHaveBeenCalled();
  });

  it('requires MFA during login when the account has MFA enabled', async () => {
    const secret = generateSecret();
    mocks.findTotpMethod.mockResolvedValue({
      mfa_method_id: 'mfa-method-id',
      secret_encrypted: encryptSecret(secret),
      is_enabled: true,
    });
    mocks.findAuthUser.mockResolvedValue({
      user_id: userId,
      email: 'user@example.com',
      password_hash: await argon2.hash('CurrentPassword1!'),
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      user_roles_user_roles_user_idTousers: [],
    });

    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'CurrentPassword1!' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('MFA_REQUIRED');
  });
});
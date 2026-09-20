import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '../src/common/utils/encryption.js';

const mocks = vi.hoisted(() => ({
  recordLoginFailure: vi.fn(),
  findAuthUser: vi.fn(),
  findUserForPasswordChange: vi.fn(),
  findTotpMethod: vi.fn(),
  findTotpMethodById: vi.fn(),
  saveTotpSecret: vi.fn(),
  enableTotpMethod: vi.fn(),
  createMfaLoginChallenge: vi.fn(),
  registerMfaChallengeAttempt: vi.fn(),
  invalidateMfaLoginChallenge: vi.fn(),
  consumeMfaLoginChallenge: vi.fn(),
  claimTotpTimeStep: vi.fn(),
  consumeRecoveryCode: vi.fn(),
  disableTotpMethod: vi.fn(),
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
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Math.floor(Date.now() / 30000) * 30000 + 5000));
    vi.clearAllMocks();
    mocks.findUserForPasswordChange.mockResolvedValue({
      email: 'user@example.com',
      password_hash: await argon2.hash('CurrentPassword1!'),
      status: 'active',
      deleted_at: null,
    });
    mocks.findTotpMethod.mockResolvedValue(null);
    mocks.saveTotpSecret.mockResolvedValue(undefined);
    mocks.enableTotpMethod.mockResolvedValue(true);
    mocks.createMfaLoginChallenge.mockResolvedValue(true);
    mocks.registerMfaChallengeAttempt.mockResolvedValue(null);
    mocks.invalidateMfaLoginChallenge.mockResolvedValue(undefined);
    mocks.consumeMfaLoginChallenge.mockResolvedValue(null);
    mocks.findTotpMethodById.mockResolvedValue(null);
    mocks.claimTotpTimeStep.mockResolvedValue(true);
    mocks.consumeRecoveryCode.mockResolvedValue(false);
    mocks.disableTotpMethod.mockResolvedValue(undefined);
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
    expect(mocks.enableTotpMethod).toHaveBeenCalledWith(
      userId,
      expect.any(BigInt),
      expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]),
    );
    expect(response.body.data.recoveryCodes).toHaveLength(10);
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

  it('returns a short-lived challenge without issuing a session when MFA is enabled', async () => {
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

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      mfaRequired: true,
      challengeToken: expect.any(String),
      expiresIn: 300,
    });
    expect(response.body.data.accessToken).toBeUndefined();
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(mocks.createMfaLoginChallenge).toHaveBeenCalledWith({
      mfaMethodId: 'mfa-method-id',
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Date),
      ipAddress: expect.any(String),
      expectedLockVersion: null,
      passwordHash: expect.any(String),
    });
  });

  it('consumes a valid login challenge and returns tokens', async () => {
    const secret = generateSecret();
    const code = await generate({ secret });
    mocks.registerMfaChallengeAttempt.mockResolvedValue({
      mfaMethodId: 'mfa-method-id',
      secretEncrypted: encryptSecret(secret),
      attempts: 1,
    });
    mocks.findTotpMethodById.mockResolvedValue({
      secret_encrypted: encryptSecret(secret),
      last_used_totp_step: null,
    });
    mocks.consumeMfaLoginChallenge.mockResolvedValue({
      kind: 'authenticated',
      user: {
        user_id: userId,
        email: 'user@example.com',
        password_hash: await argon2.hash('CurrentPassword1!'),
        status: 'active',
        deleted_at: null,
        user_roles_user_roles_user_idTousers: [],
      },
    });

    const response = await request(createApp())
      .post('/api/v1/auth/mfa/challenge/verify')
      .send({ challengeToken: 'a'.repeat(43), code });

    expect(response.status).toBe(200);
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    expect(mocks.consumeMfaLoginChallenge).toHaveBeenCalledOnce();
  });

  it('invalidates a login challenge after the fifth invalid code', async () => {
    const secret = generateSecret();
    mocks.registerMfaChallengeAttempt.mockResolvedValue({
      mfaMethodId: 'mfa-method-id',
      secretEncrypted: encryptSecret(secret),
      attempts: 5,
    });

    const response = await request(createApp())
      .post('/api/v1/auth/mfa/challenge/verify')
      .send({ challengeToken: 'b'.repeat(43), code: '000000' });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_MFA_CODE');
    expect(mocks.invalidateMfaLoginChallenge).toHaveBeenCalledOnce();
  });

  it('accepts an unused recovery code for a login challenge', async () => {
    mocks.registerMfaChallengeAttempt.mockResolvedValue({
      mfaMethodId: 'mfa-method-id',
      secretEncrypted: 'encrypted-secret',
      attempts: 1,
    });
    mocks.consumeRecoveryCode.mockResolvedValue(true);
    mocks.consumeMfaLoginChallenge.mockResolvedValue({
      kind: 'authenticated',
      user: {
        user_id: userId,
        status: 'active',
        deleted_at: null,
        user_roles_user_roles_user_idTousers: [],
      },
    });

    const response = await request(createApp())
      .post('/api/v1/auth/mfa/challenge/verify')
      .send({ challengeToken: 'c'.repeat(43), code: 'ABCD-EF12-3456' });

    expect(response.status).toBe(200);
    expect(mocks.consumeRecoveryCode).toHaveBeenCalledWith(
      'mfa-method-id',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('rejects a replayed TOTP time step', async () => {
    const secret = generateSecret();
    const code = await generate({ secret });
    mocks.registerMfaChallengeAttempt.mockResolvedValue({
      mfaMethodId: 'mfa-method-id',
      secretEncrypted: encryptSecret(secret),
      attempts: 1,
    });
    mocks.findTotpMethodById.mockResolvedValue({
      secret_encrypted: encryptSecret(secret),
      last_used_totp_step: null,
    });
    mocks.claimTotpTimeStep.mockResolvedValue(false);

    const response = await request(createApp())
      .post('/api/v1/auth/mfa/challenge/verify')
      .send({ challengeToken: 'd'.repeat(43), code });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_MFA_CODE');
    expect(mocks.consumeMfaLoginChallenge).not.toHaveBeenCalled();
  });

  it('disables MFA after password and fresh authenticator verification', async () => {
    const secret = generateSecret();
    const code = await generate({ secret });
    mocks.findTotpMethod.mockResolvedValue({
      mfa_method_id: 'mfa-method-id',
      secret_encrypted: encryptSecret(secret),
      is_enabled: true,
      last_used_totp_step: null,
    });

    const response = await request(createApp())
      .post('/api/v1/auth/mfa/disable')
      .set('authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'CurrentPassword1!', code });

    expect(response.status).toBe(200);
    expect(mocks.disableTotpMethod).toHaveBeenCalledWith(userId);
  });
});

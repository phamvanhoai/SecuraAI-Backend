import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
const mocks = vi.hoisted(() => ({
  verify: vi.fn(async () => true),
  findAuthUser: vi.fn(),
  findTotpMethod: vi.fn(),
  recordLoginFailure: vi.fn(),
  createMfaLoginChallenge: vi.fn(),
  registerMfaChallengeAttempt: vi.fn(),
  consumeRecoveryCode: vi.fn(),
  invalidateMfaLoginChallenge: vi.fn(),
}));
vi.mock('argon2', () => ({ default: { verify: mocks.verify } }));
vi.mock('../src/modules/auth/auth.repository.js', () => ({ authRepository: mocks }));
import { createApp } from '../src/app.js';
const login = (email: string) =>
  request(createApp())
    .post('/api/v1/auth/login')
    .set('user-agent', 'Test browser')
    .send({ email, password: 'Password1!' });
describe('Login history authentication events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.findAuthUser.mockResolvedValue(null);
    mocks.recordLoginFailure.mockResolvedValue(undefined);
  });
  it('records unknown emails with a nullable user and generic failure reason', async () => {
    expect((await login('unknown@example.test')).status).toBe(401);
    expect(mocks.recordLoginFailure).toHaveBeenCalledWith({
      userId: null,
      email: 'unknown@example.test',
      reason: 'INVALID_CREDENTIALS',
      ipAddress: expect.any(String),
      userAgent: 'Test browser',
    });
  });
  it('records a wrong password for a known user with the same generic credential error', async () => {
    mocks.findAuthUser.mockResolvedValue({
      user_id: 'user',
      password_hash: 'hash',
      status: 'active',
      deleted_at: null,
    });
    mocks.verify.mockResolvedValue(false);
    const response = await login('user@example.test');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(mocks.recordLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user',
        email: 'user@example.test',
        reason: 'INVALID_CREDENTIALS',
      }),
    );
    expect(mocks.findTotpMethod).not.toHaveBeenCalled();
  });

  it('records a known inactive account without storing credentials', async () => {
    mocks.findAuthUser.mockResolvedValue({
      user_id: 'user',
      email: 'user@example.test',
      password_hash: 'hash',
      status: 'locked',
      deleted_at: null,
    });
    expect((await login('user@example.test')).status).toBe(403);
    expect(mocks.recordLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user', reason: 'ACCOUNT_INACTIVE' }),
    );
  });
  it('does not record successful login at MFA challenge issuance', async () => {
    mocks.findAuthUser.mockResolvedValue({
      user_id: 'user',
      email: 'user@example.test',
      password_hash: 'hash',
      status: 'active',
      deleted_at: null,
    });
    mocks.findTotpMethod.mockResolvedValue({
      mfa_method_id: 'method',
      secret_encrypted: 'encrypted',
      is_enabled: true,
    });
    mocks.createMfaLoginChallenge.mockResolvedValue(true);
    expect((await login('user@example.test')).body.data).toMatchObject({ mfaRequired: true });
    expect(mocks.recordLoginFailure).not.toHaveBeenCalled();
  });
  it('records a failed recovery-code attempt for a known MFA challenge', async () => {
    mocks.registerMfaChallengeAttempt.mockResolvedValue({
      userId: 'user',
      email: 'user@example.test',
      mfaMethodId: 'method',
      secretEncrypted: 'encrypted',
      attempts: 1,
    });
    mocks.consumeRecoveryCode.mockResolvedValue(false);
    expect(
      (
        await request(createApp())
          .post('/api/v1/auth/mfa/challenge/verify')
          .send({ challengeToken: 'x'.repeat(32), code: 'ABCD-EFGH-IJKL' })
      ).status,
    ).toBe(401);
    expect(mocks.recordLoginFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'INVALID_MFA_CODE',
        userId: 'user',
        email: 'user@example.test',
      }),
    );
  });
});

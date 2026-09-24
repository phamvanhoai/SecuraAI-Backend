import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findActiveUserByEmail: vi.fn(),
  createPasswordResetToken: vi.fn(),
  deletePasswordResetToken: vi.fn(),
  consumePasswordResetToken: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('../src/modules/auth/auth.repository.js', () => ({ authRepository: mocks }));
vi.mock('../src/modules/auth/auth.email.service.js', () => ({ authEmailService: mocks }));

import { createApp } from '../src/app.js';

describe('password reset HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findActiveUserByEmail.mockResolvedValue({
      user_id: '00000000-0000-4000-8000-000000000001',
    });
    mocks.createPasswordResetToken.mockResolvedValue(undefined);
    mocks.deletePasswordResetToken.mockResolvedValue(undefined);
    mocks.consumePasswordResetToken.mockResolvedValue(true);
    mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it('sends a reset email without exposing whether an account exists', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'USER@EXAMPLE.COM' });

    expect(response.status).toBe(202);
    expect(response.body.success).toBe(true);
    expect(response.body.data.message).toContain('If the account exists');
    expect(response.body.data.resetToken).toBeUndefined();
    expect(mocks.findActiveUserByEmail).toHaveBeenCalledWith('user@example.com');
    expect(mocks.createPasswordResetToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(String), tokenHash: expect.any(String) }),
    );
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      token: expect.stringMatching(/^\d{6}$/),
    });
  });

  it('returns the same response when the account is not active or does not exist', async () => {
    mocks.findActiveUserByEmail.mockResolvedValue(null);

    const response = await request(createApp())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'missing@example.com' });

    expect(response.status).toBe(202);
    expect(response.body.data.message).toContain('If the account exists');
    expect(mocks.createPasswordResetToken).not.toHaveBeenCalled();
    expect(mocks.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('rejects invalid request input and consumes a valid reset token', async () => {
    const invalid = await request(createApp())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'not-an-email' });
    expect(invalid.status).toBe(422);

    const confirmed = await request(createApp())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token: '123456',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toEqual({
      success: true,
      data: { message: 'Password reset successfully. Please log in with your new password.' },
    });
    expect(mocks.consumePasswordResetToken).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });

  it('rejects an expired or already-used reset token', async () => {
    mocks.consumePasswordResetToken.mockResolvedValue(false);

    const response = await request(createApp())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token: '123456',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PASSWORD_RESET_TOKEN');
  });

  it('rejects non-six-digit tokens and mismatched passwords', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: '12345', newPassword: 'NewPassword123!', confirmPassword: 'Different123!' });

    expect(response.status).toBe(422);
    expect(mocks.consumePasswordResetToken).not.toHaveBeenCalled();
  });

  it('removes the reset token when email delivery fails', async () => {
    mocks.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP unavailable'));

    const response = await request(createApp())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'USER@EXAMPLE.COM' });

    expect(response.status).toBe(500);
    expect(mocks.deletePasswordResetToken).toHaveBeenCalledWith(expect.any(String));
  });
});
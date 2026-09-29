import argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { user_status } from '@prisma/client';

vi.mock('../src/modules/authentication-account/auth.repository.js', () => ({
  authRepository: {
    findActiveUserByEmail: vi.fn(),
    createPasswordResetToken: vi.fn(),
    deletePasswordResetToken: vi.fn(),
    consumePasswordResetToken: vi.fn(),
    findUserForPasswordChange: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock('../src/modules/authentication-account/auth.email.service.js', () => ({
  authEmailService: { sendPasswordResetEmail: vi.fn() },
}));

import { authEmailService } from '../src/modules/authentication-account/auth.email.service.js';
import { authRepository } from '../src/modules/authentication-account/auth.repository.js';
import { authService } from '../src/modules/authentication-account/auth.service.js';

const userId = '00000000-0000-4000-8000-000000000001';

describe('V2 password management service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses a generic reset flow and stores only a token hash', async () => {
    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValue({
      id: userId,
      email: 'user@example.com',
    });
    vi.mocked(authRepository.createPasswordResetToken).mockResolvedValue();
    vi.mocked(authEmailService.sendPasswordResetEmail).mockResolvedValue();

    await authService.requestPasswordReset({ email: 'user@example.com' });

    expect(authRepository.createPasswordResetToken).toHaveBeenCalledWith({
      userId,
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      expiresAt: expect.any(Date),
    });
    expect(authEmailService.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      token: expect.stringMatching(/^\d{6}$/),
    });
  });

  it('does nothing for an unknown account and removes the token if email delivery fails', async () => {
    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValueOnce(null);
    await authService.requestPasswordReset({ email: 'missing@example.com' });
    expect(authEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();

    vi.mocked(authRepository.findActiveUserByEmail).mockResolvedValueOnce({
      id: userId,
      email: 'user@example.com',
    });
    vi.mocked(authRepository.createPasswordResetToken).mockResolvedValue();
    vi.mocked(authEmailService.sendPasswordResetEmail).mockRejectedValue(new Error('SMTP failed'));
    vi.mocked(authRepository.deletePasswordResetToken).mockResolvedValue();
    await expect(authService.requestPasswordReset({ email: 'user@example.com' })).rejects.toThrow(
      'SMTP failed',
    );
    expect(authRepository.deletePasswordResetToken).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });

  it('rejects an invalid reset code', async () => {
    vi.mocked(authRepository.consumePasswordResetToken).mockResolvedValue(false);
    await expect(
      authService.confirmPasswordReset({
        token: '123456',
        newPassword: 'NewPassword!',
        confirmPassword: 'NewPassword!',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD_RESET_TOKEN' });
  });

  it('changes a password only when the current password matches', async () => {
    const oldHash = await argon2.hash('OldPassword!');
    vi.mocked(authRepository.findUserForPasswordChange).mockResolvedValue({
      id: userId,
      password_hash: oldHash,
      status: user_status.ACTIVE,
    });
    vi.mocked(authRepository.changePassword).mockResolvedValue(true);

    await authService.changePassword(userId, {
      currentPassword: 'OldPassword!',
      newPassword: 'NewPassword!',
      confirmPassword: 'NewPassword!',
    });
    expect(authRepository.changePassword).toHaveBeenCalledWith(userId, oldHash, expect.any(String));

    await expect(
      authService.changePassword(userId, {
        currentPassword: 'WrongPassword!',
        newPassword: 'AnotherPassword!',
        confirmPassword: 'AnotherPassword!',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });
  });
});

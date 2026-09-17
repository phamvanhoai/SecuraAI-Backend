import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFromChallenge: vi.fn(),
  list: vi.fn(),
  decide: vi.fn(),
  sendMfaRecoveryDecisionEmail: vi.fn(),
}));

vi.mock('../src/modules/auth/mfa-recovery.repository.js', () => ({
  mfaRecoveryRepository: {
    createFromChallenge: mocks.createFromChallenge,
    list: mocks.list,
    decide: mocks.decide,
  },
}));
vi.mock('../src/modules/auth/auth.email.service.js', () => ({
  authEmailService: { sendMfaRecoveryDecisionEmail: mocks.sendMfaRecoveryDecisionEmail },
}));

import { mfaRecoveryService } from '../src/modules/auth/mfa-recovery.service.js';

describe('mfaRecoveryService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a pending request from a challenge without exposing the token', async () => {
    mocks.createFromChallenge.mockResolvedValue({
      kind: 'created',
      request: {
        approval_request_id: 'request-1',
        status: 'pending',
        submitted_at: new Date('2026-09-15T00:00:00Z'),
      },
    });

    const result = await mfaRecoveryService.create({ challengeToken: 'a'.repeat(43) });

    expect(result).toMatchObject({ id: 'request-1', status: 'pending' });
    expect(mocks.createFromChallenge).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(JSON.stringify(result)).not.toContain('a'.repeat(43));
  });

  it('rejects an invalid or expired challenge', async () => {
    mocks.createFromChallenge.mockResolvedValue({ kind: 'invalid_challenge' });
    await expect(mfaRecoveryService.create({ challengeToken: 'b'.repeat(43) })).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_MFA_CHALLENGE',
    });
  });

  it('sends the decision notification after approval', async () => {
    mocks.decide.mockResolvedValue({
      kind: 'decided',
      email: 'user@example.com',
      fullName: 'Example User',
    });
    mocks.sendMfaRecoveryDecisionEmail.mockResolvedValue(undefined);

    const result = await mfaRecoveryService.decide(
      '00000000-0000-4000-8000-000000000001',
      'admin-1',
      'approved',
      { reason: 'Identity verified by video call' },
    );

    expect(result.status).toBe('approved');
    expect(mocks.sendMfaRecoveryDecisionEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      fullName: 'Example User',
      decision: 'approved',
    });
  });

  it('prevents a second decision', async () => {
    mocks.decide.mockResolvedValue({ kind: 'already_decided' });
    await expect(
      mfaRecoveryService.decide(
        '00000000-0000-4000-8000-000000000001',
        'admin-1',
        'rejected',
        { reason: 'Identity evidence did not match' },
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MFA_RECOVERY_ALREADY_DECIDED' });
  });
});

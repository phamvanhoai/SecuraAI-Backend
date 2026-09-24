import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn(), decide: vi.fn() }));
vi.mock('../src/modules/auth/mfa-recovery.service.js', () => ({ mfaRecoveryService: mocks }));

import { createApp } from '../src/app.js';

const signToken = (permissions: string[]) =>
  jwt.sign({ type: 'access', roles: ['ADMIN'], permissions }, 'test-secret-with-at-least-thirty-two-characters', {
    algorithm: 'HS256',
    subject: '00000000-0000-4000-8000-000000000001',
    issuer: 'securaai-api',
    audience: 'securaai-client',
    expiresIn: '15m',
  });

describe('MFA recovery HTTP API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a recovery request using only the current challenge', async () => {
    mocks.create.mockResolvedValue({ id: 'request-1', status: 'pending', submittedAt: new Date() });
    const response = await request(createApp())
      .post('/api/v1/auth/mfa/recovery-requests')
      .send({ challengeToken: 'a'.repeat(43) });
    expect(response.status).toBe(202);
    expect(response.body.data.status).toBe('pending');
  });

  it('requires the dedicated permission to list requests', async () => {
    const response = await request(createApp())
      .get('/api/v1/admin/mfa-recovery-requests')
      .set('authorization', `Bearer ${signToken([])}`);
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('allows an authorized administrator to approve with a reason', async () => {
    mocks.decide.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      status: 'approved',
    });
    const response = await request(createApp())
      .post('/api/v1/admin/mfa-recovery-requests/00000000-0000-4000-8000-000000000002/approve')
      .set('authorization', `Bearer ${signToken(['mfa-recovery.manage'])}`)
      .send({ reason: 'Identity verified through approved company procedure' });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('approved');
  });
});

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), issue: vi.fn() }));
vi.mock('../src/modules/training-awareness/certificate.repository.js', () => ({
  certificateRepository: mocks,
}));
import { createApp } from '../src/app.js';
import { certificateService } from '../src/modules/training-awareness/certificate.service.js';
const id = '00000000-0000-4000-8000-000000000001';
const token = (permissions: string[]) =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: id,
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );
const path = `/api/v1/training/enrollments/${id}/certificate`;
const record = {
  eligible: true,
  enrollment: {
    training_enrollment_id: id,
    completed_at: new Date(),
    users: { full_name: 'Employee' },
    training_campaigns: { title: 'Campaign', training_courses: { title: 'Course' } },
    training_certificates: {
      training_certificate_id: id,
      certificate_number: 'SEC-TR-SAMPLE',
      issued_at: new Date(),
      users: { full_name: 'Security Officer' },
    },
  },
};
describe('training certificates', () => {
  beforeEach(() => vi.clearAllMocks());
  it('requires authentication and distinct issuance permission', async () => {
    expect((await request(createApp()).post(path)).status).toBe(401);
    expect(
      (
        await request(createApp())
          .post(path)
          .set('authorization', `Bearer ${token(['training-completion.read'])}`)
      ).status,
    ).toBe(403);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it('validates the enrollment UUID', async () => {
    expect(
      (
        await request(createApp())
          .post('/api/v1/training/enrollments/invalid/certificate')
          .set('authorization', `Bearer ${token(['training-certificates.issue'])}`)
      ).status,
    ).toBe(422);
  });
  it('rejects ineligible enrollments without exposing internals', async () => {
    mocks.issue.mockResolvedValue({ kind: 'ineligible' });
    const response = await request(createApp())
      .post(path)
      .set('authorization', `Bearer ${token(['training-certificates.issue'])}`);
    expect(response.status).toBe(409);
  });
  it('returns existing or newly persisted certificates through the same contract', async () => {
    mocks.issue.mockResolvedValue({ kind: 'issued', result: record });
    const response = await request(createApp())
      .post(path)
      .set('authorization', `Bearer ${token(['training-certificates.issue'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        enrollmentId: id,
        certificate: { number: 'SEC-TR-SAMPLE', issuedBy: 'Security Officer' },
      },
    });
  });
  it('allows completion readers to view but not issue', async () => {
    mocks.get.mockResolvedValue(record);
    expect(
      (
        await request(createApp())
          .get(path)
          .set('authorization', `Bearer ${token(['training-completion.read'])}`)
      ).status,
    ).toBe(200);
  });
  it('maps missing enrollments to 404', async () => {
    mocks.get.mockResolvedValue(null);
    expect(
      (
        await request(createApp())
          .get(path)
          .set('authorization', `Bearer ${token(['training-completion.read'])}`)
      ).status,
    ).toBe(404);
  });
  it('enforces permissions in the service as well as routes', async () => {
    await expect(
      certificateService.issue(
        id,
        { userId: id, permissions: [] },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});

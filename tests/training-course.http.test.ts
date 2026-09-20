import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listCourses: vi.fn(), createCourse: vi.fn() }));
vi.mock('../src/modules/training-awareness/training-awareness.repository.js', () => ({
  trainingAwarenessRepository: mocks,
}));
vi.mock('../src/modules/training-awareness/course-draft.repository.js', () => ({
  courseDraftRepository: { find: vi.fn(), update: vi.fn() },
}));
import { createApp } from '../src/app.js';

const token = (permissions: string[]): string =>
  jwt.sign(
    { type: 'access', roles: [], permissions },
    'test-secret-with-at-least-thirty-two-characters',
    {
      algorithm: 'HS256',
      subject: '00000000-0000-4000-8000-000000000001',
      issuer: 'securaai-api',
      audience: 'securaai-client',
      expiresIn: '15m',
    },
  );

describe('training courses HTTP API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCourses.mockResolvedValue({ items: [], total: 0 });
  });

  it('requires authentication and read permission', async () => {
    expect((await request(createApp()).get('/api/v1/training/courses')).status).toBe(401);
    expect(
      (
        await request(createApp())
          .get('/api/v1/training/courses')
          .set('authorization', `Bearer ${token([])}`)
      ).status,
    ).toBe(403);
  });

  it('returns a paginated list', async () => {
    const response = await request(createApp())
      .get('/api/v1/training/courses?page=1&limit=20&status=published')
      .set('authorization', `Bearer ${token(['training-courses.read'])}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [], pagination: { total: 0, totalPages: 0 } },
    });
    expect(mocks.listCourses).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('rejects unbounded queries and malformed create bodies', async () => {
    const auth = `Bearer ${token(['training-courses.read', 'training-courses.create'])}`;
    expect(
      (
        await request(createApp())
          .get('/api/v1/training/courses?limit=101')
          .set('authorization', auth)
      ).status,
    ).toBe(422);
    expect(
      (
        await request(createApp())
          .get('/api/v1/training/courses?status=inactive')
          .set('authorization', auth)
      ).status,
    ).toBe(422);
    expect(
      (
        await request(createApp())
          .post('/api/v1/training/courses')
          .set('authorization', auth)
          .send({ title: 'Phishing', content: 'short' })
      ).status,
    ).toBe(422);
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it('protects draft editing and validates the complete edit body', async () => {
    const courseId = 'e2ef8324-9ac0-4e7f-b16d-50050274a72e';
    expect((await request(createApp()).get(`/api/v1/training/courses/${courseId}`)).status).toBe(
      401,
    );
    expect(
      (
        await request(createApp())
          .get(`/api/v1/training/courses/${courseId}`)
          .set('authorization', `Bearer ${token(['training-courses.read'])}`)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(createApp())
          .patch(`/api/v1/training/courses/${courseId}`)
          .set('authorization', `Bearer ${token(['training-courses.update'])}`)
          .send({ title: 'Incomplete draft' })
      ).status,
    ).toBe(422);
  });
});

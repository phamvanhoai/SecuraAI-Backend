import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/modules/training-awareness/department-report.repository.js', () => ({
  departmentReportRepository: {
    get: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      summary: {
        employees: 0,
        assignedEmployees: 0,
        assigned: 0,
        completed: 0,
        overdue: 0,
        coverageRate: 0,
        completionRate: 0,
      },
    }),
  },
}));
import { createApp } from '../src/app.js';
const token = (permissions: string[]) =>
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
describe('department training report HTTP', () => {
  const path = '/api/v1/training/department-report';
  it('requires authentication and report permission', async () => {
    expect((await request(createApp()).get(path)).status).toBe(401);
    expect(
      (
        await request(createApp())
          .get(path)
          .set('authorization', `Bearer ${token(['training-completion.read'])}`)
      ).status,
    ).toBe(403);
  });
  it('returns paginated summary and validates parameters', async () => {
    const auth = `Bearer ${token(['training-department-reports.read'])}`;
    const response = await request(createApp()).get(path).set('authorization', auth);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { items: [], pagination: { total: 0, totalPages: 1 } },
    });
    expect(
      (await request(createApp()).get(`${path}?limit=101`).set('authorization', auth)).status,
    ).toBe(422);
  });
});

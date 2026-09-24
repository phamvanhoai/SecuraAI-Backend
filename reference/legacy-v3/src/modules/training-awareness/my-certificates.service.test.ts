import { beforeEach, describe, expect, it, vi } from 'vitest';
import { myCertificatesQuerySchema } from './dto/my-certificates.dto.js';
import { myCertificatesService } from './my-certificates.service.js';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('./my-certificates.repository.js', () => ({ myCertificatesRepository: mocks }));

const query = { page: 1, limit: 10, q: '' };

describe('my certificates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bounds list input', () => {
    expect(myCertificatesQuerySchema.parse({})).toEqual(query);
    expect(myCertificatesQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(myCertificatesQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(myCertificatesQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects missing permission without querying', async () => {
    await expect(
      myCertificatesService.list(query, { userId: 'user-1', permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('queries only for the authenticated user and maps certificate metadata', async () => {
    mocks.list.mockResolvedValue({
      total: 1,
      items: [
        {
          training_certificate_id: 'cert-1',
          certificate_number: 'SEC-TR-1',
          issued_at: new Date('2026-09-20T00:00:00Z'),
          users: { full_name: 'Officer' },
          training_enrollments: {
            training_enrollment_id: 'enrollment-1',
            completed_at: new Date('2026-09-19T00:00:00Z'),
            training_campaigns: {
              title: 'Autumn campaign',
              training_courses: { title: 'Phishing' },
            },
          },
        },
      ],
    });
    const result = await myCertificatesService.list(query, {
      userId: 'user-1',
      permissions: ['training-certificates.read-own'],
    });
    expect(mocks.list).toHaveBeenCalledWith('user-1', query);
    expect(result.items[0]).toMatchObject({ number: 'SEC-TR-1', courseTitle: 'Phishing' });
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issuedCertificatesQuerySchema } from './dto/issued-certificates.dto.js';
import { issuedCertificatesService } from './issued-certificates.service.js';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('./issued-certificates.repository.js', () => ({ issuedCertificatesRepository: mocks }));

const query = { page: 1, limit: 10, q: '' };

describe('issued certificates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('bounds list input', () => {
    expect(issuedCertificatesQuerySchema.parse({})).toEqual(query);
    expect(issuedCertificatesQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(issuedCertificatesQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });

  it('rejects missing permission without querying', async () => {
    await expect(issuedCertificatesService.list(query, { permissions: [] })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('maps learner and certificate metadata', async () => {
    mocks.list.mockResolvedValue({
      total: 1,
      items: [
        {
          training_certificate_id: 'cert-1',
          certificate_number: 'SEC-TR-1',
          issued_at: new Date('2026-09-20T00:00:00Z'),
          users: { full_name: 'Security Officer' },
          training_enrollments: {
            training_enrollment_id: 'enrollment-1',
            completed_at: new Date('2026-09-19T00:00:00Z'),
            users: {
              full_name: 'Employee One',
              email: 'employee@example.com',
              employee_code: 'E001',
              departments: { name: 'Operations' },
            },
            training_campaigns: {
              title: 'Autumn campaign',
              training_courses: { title: 'Phishing' },
            },
          },
        },
      ],
    });
    const result = await issuedCertificatesService.list(query, {
      permissions: ['training-certificates.read-issued'],
    });
    expect(mocks.list).toHaveBeenCalledWith(query);
    expect(result.items[0]).toMatchObject({
      number: 'SEC-TR-1',
      learner: { name: 'Employee One', department: 'Operations' },
      courseTitle: 'Phishing',
    });
  });
});

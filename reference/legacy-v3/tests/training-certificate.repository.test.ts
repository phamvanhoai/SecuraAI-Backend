import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  pass: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  lock: vi.fn(),
}));
vi.mock('../src/database/prisma.js', () => {
  const client = {
    training_enrollments: { findUnique: mocks.read },
    quiz_attempts: { findFirst: mocks.pass },
    training_certificates: { create: mocks.create },
    audit_logs: { create: mocks.audit },
    $queryRaw: mocks.lock,
  };
  return {
    prisma: {
      ...client,
      $transaction: (callback: (tx: typeof client) => unknown) => callback(client),
    },
  };
});
import { certificateRepository } from '../src/modules/training-awareness/certificate.repository.js';
const id = '00000000-0000-4000-8000-000000000001';
const context = { actorUserId: id, ipAddress: null, userAgent: null };
const enrollment = {
  training_enrollment_id: id,
  user_id: id,
  status: 'completed',
  progress_percent: 100,
  completed_at: new Date(),
  training_certificates: null,
  users: { full_name: 'Employee' },
  training_campaigns: {
    title: 'Campaign',
    training_courses: { title: 'Course', quizzes: [{ quiz_id: id }] },
  },
};
describe('certificate repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(enrollment);
    mocks.pass.mockResolvedValue({ quiz_attempt_id: id });
    mocks.create.mockResolvedValue({
      training_certificate_id: id,
      certificate_number: 'CERT-1',
      issued_at: new Date(),
      users: null,
    });
  });
  it('locks before checking eligibility and writes certificate plus audit in one transaction', async () => {
    expect((await certificateRepository.issue(id, context)).kind).toBe('issued');
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.read.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.pass).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          quiz_id: id,
          training_enrollment_id: id,
          passed: true,
          submitted_at: { not: null },
        },
      }),
    );
  });
  it.each([
    { status: 'withdrawn' },
    { status: 'in_progress' },
    { progress_percent: 99 },
    { completed_at: null },
  ])('rejects incomplete enrollment %j', async (change) => {
    mocks.read.mockResolvedValue({ ...enrollment, ...change });
    expect((await certificateRepository.issue(id, context)).kind).toBe('ineligible');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('requires a submitted passing final assessment for the enrollment', async () => {
    mocks.pass.mockResolvedValue(null);
    expect((await certificateRepository.issue(id, context)).kind).toBe('ineligible');
  });
  it('does not require an assessment when the course has no final assessment', async () => {
    mocks.read.mockResolvedValue({
      ...enrollment,
      training_campaigns: {
        ...enrollment.training_campaigns,
        training_courses: { title: 'Course', quizzes: [] },
      },
    });
    expect((await certificateRepository.issue(id, context)).kind).toBe('issued');
    expect(mocks.pass).not.toHaveBeenCalled();
  });
  it('does not duplicate a certificate or its audit on repeated requests', async () => {
    mocks.read.mockResolvedValue({
      ...enrollment,
      training_certificates: { training_certificate_id: id },
    });
    expect((await certificateRepository.issue(id, context)).kind).toBe('issued');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('propagates audit failures so the enclosing transaction rolls back', async () => {
    mocks.audit.mockRejectedValue(new Error('Audit unavailable'));
    await expect(certificateRepository.issue(id, context)).rejects.toThrow('Audit unavailable');
  });
});

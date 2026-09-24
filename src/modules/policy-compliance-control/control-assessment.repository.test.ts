import { describe, expect, it, vi } from 'vitest';
import { controlAssessmentRepository } from './control-assessment.repository.js';

const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock('../../database/prisma.js', () => ({ prisma: prismaMock }));

describe('controlAssessmentRepository.create', () => {
  it('propagates an audit failure so the transaction can roll back', async () => {
    const database = {
      control_assessments: { create: vi.fn().mockResolvedValue({ control_assessment_id: 'assessment-1' }) },
      audit_logs: { create: vi.fn().mockRejectedValue(new Error('audit unavailable')) },
    };
    prismaMock.$transaction.mockImplementation(async (callback: (client: typeof database) => Promise<unknown>) => callback(database));
    await expect(controlAssessmentRepository.create('control-1', { complianceStatus: 'compliant', score: 90 }, 'user-1', { ipAddress: null, userAgent: null })).rejects.toThrow('audit unavailable');
    expect(database.control_assessments.create).toHaveBeenCalledOnce();
    expect(database.audit_logs.create).toHaveBeenCalledOnce();
  });
});

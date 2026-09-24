import { beforeEach, describe, expect, it, vi } from 'vitest';
import { controlAssessmentService } from './control-assessment.service.js';

const repository = vi.hoisted(() => ({ findControl: vi.fn(), create: vi.fn(), list: vi.fn(), listHistory: vi.fn() }));
vi.mock('./control-assessment.repository.js', () => ({ controlAssessmentRepository: repository }));
const actor = { userId: 'user-1', permissions: ['compliance.assess-controls'] };
const context = { ipAddress: null, userAgent: null };

describe('controlAssessmentService', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects actors without permission before accessing data', async () => {
    await expect(controlAssessmentService.history('control-1', { userId: 'user-1', permissions: [] })).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findControl).not.toHaveBeenCalled();
  });
  it('rejects a missing control', async () => {
    repository.findControl.mockResolvedValue(null);
    await expect(controlAssessmentService.create('control-1', { complianceStatus: 'compliant', score: 90 }, actor, context)).rejects.toMatchObject({ statusCode: 404, code: 'CONTROL_NOT_FOUND' });
  });
  it('rejects a review date in the past', async () => {
    repository.findControl.mockResolvedValue({ compliance_control_id: 'control-1' });
    await expect(controlAssessmentService.create('control-1', { complianceStatus: 'compliant', score: 90, nextReviewAt: '2020-01-01T00:00:00.000Z' }, actor, context)).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_NEXT_REVIEW_AT' });
    expect(repository.create).not.toHaveBeenCalled();
  });
});

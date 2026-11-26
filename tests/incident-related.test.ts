import { beforeEach, expect, it, vi } from 'vitest';
import { relatedTitleTerms } from '../src/modules/information-security-incident-management/incident-related.js';
import { createIncidentFromSourceSchema } from '../src/modules/information-security-incident-management/dto/create-incident-from-source.dto.js';
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  finding: vi.fn(),
  claim: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../src/modules/audit-security-reporting/audit-writer.js', () => ({
  auditWriter: { record: mocks.audit },
}));
vi.mock('../src/database/prisma.js', () => ({
  prisma: {
    $transaction: (fn: (tx: object) => unknown) =>
      fn({
        users: { findUnique: async () => ({ role: 'SECURITY_OFFICER', status: 'ACTIVE' }) },
        incidents: { findMany: mocks.findMany, create: mocks.create },
        security_findings: { findFirst: mocks.finding, updateMany: mocks.claim },
      }),
  },
}));
import { incidentsRepository } from '../src/modules/information-security-incident-management/incidents.repository.js';
const id = '00000000-0000-4000-8000-000000000010';
const input = {
  sourceType: 'manual' as const,
  title: 'Ransomware PC-KT-01',
  description: 'Files on the accounting computer were encrypted.',
  severity: 'high' as const,
  detectedAt: new Date('2026-11-26T00:00:00Z'),
};
const record = {
  id,
  incident_code: 'INC-001',
  title: input.title,
  status: 'OPEN',
  detected_at: input.detectedAt,
  created_at: input.detectedAt,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMany.mockResolvedValue([record]);
  mocks.create.mockResolvedValue({ id });
  mocks.finding.mockResolvedValue({
    id,
    identified_at: input.detectedAt,
    incidents: null,
    anomaly_alerts: { status: 'CONFIRMED' },
  });
  mocks.claim.mockResolvedValue({ count: 1 });
});
it('matches reordered titles and Vietnamese diacritics, not generic words or unrelated incidents', () => {
  expect(relatedTitleTerms('Ransomware PC-KT-01', 'PC-KT-01 ransomware')).toHaveLength(2);
  expect(relatedTitleTerms('Mất thiết bị LAP-01', 'Mat thiet bi LAP-01')).not.toHaveLength(0);
  expect(relatedTitleTerms('Security incident', 'Security incident')).toEqual([]);
  expect(relatedTitleTerms('Ransomware PC-KT-01', 'Lost device LAP-02')).toEqual([]);
});
it.each(['manual', 'finding'] as const)(
  'stops %s creation before any writes when another incident may match',
  async (sourceType) => {
    await expect(
      incidentsRepository.createFromSource(id, { ...input, sourceType, sourceId: id }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'INCIDENT_RELATED_REVIEW_REQUIRED',
      details: { items: [expect.objectContaining({ incidentCode: 'INC-001' })] },
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, where: expect.any(Object) }),
    );
  },
);
it('creates immediately with no candidates and records no override', async () => {
  mocks.findMany.mockResolvedValue([]);
  await expect(incidentsRepository.createFromSource(id, input)).resolves.toMatchObject({
    outcome: 'created',
  });
  expect(mocks.audit).not.toHaveBeenCalled();
});
it('requires the currently suggested IDs as well as a reason', async () => {
  await expect(
    incidentsRepository.createFromSource(id, {
      ...input,
      separateReason: 'A different attack campaign.',
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('creates separately and atomically audits the reason and reviewed incidents', async () => {
  await incidentsRepository.createFromSource(id, {
    ...input,
    separateReason: 'A different attack campaign.',
    reviewedIncidentIds: [id],
  });
  expect(mocks.audit).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'INCIDENT_CREATED_SEPARATELY',
      afterData: { reason: 'A different attack campaign.', reviewedIncidentIds: [id] },
    }),
    expect.any(Object),
  );
});
it('propagates audit failure so the transaction cannot commit', async () => {
  mocks.audit.mockRejectedValueOnce(new Error('Audit unavailable'));
  await expect(
    incidentsRepository.createFromSource(id, {
      ...input,
      separateReason: 'A different attack campaign.',
      reviewedIncidentIds: [id],
    }),
  ).rejects.toThrow('Audit unavailable');
});
it('preserves the exact finding conversion guard before similarity lookup', async () => {
  mocks.finding.mockResolvedValue({
    incidents: { id, incident_code: 'INC-001' },
    anomaly_alerts: { status: 'CONFIRMED' },
  });
  await expect(
    incidentsRepository.createFromSource(id, { ...input, sourceType: 'finding', sourceId: id }),
  ).resolves.toMatchObject({ outcome: 'already_converted' });
  expect(mocks.findMany).not.toHaveBeenCalled();
});
it('validates override boundaries', () => {
  expect(
    createIncidentFromSourceSchema.safeParse({ ...input, separateReason: 'short' }).success,
  ).toBe(false);
  expect(
    createIncidentFromSourceSchema.safeParse({ ...input, reviewedIncidentIds: ['not-an-id'] })
      .success,
  ).toBe(false);
});

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ actor: vi.fn(), findFirst: vi.fn() }));
vi.mock('../src/database/prisma.js', () => ({
  prisma: { users: { findUnique: mocks.actor }, policy_versions: { findFirst: mocks.findFirst } },
}));
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { policyComplianceService } from '../src/modules/policy-compliance-control/policy-compliance.service.js';
import { editPolicyDraftParamsSchema } from '../src/modules/policy-compliance-control/dto/edit-policy-draft.dto.js';
import { openApiSpec } from '../src/docs/openapi.js';
const id = '00000000-0000-4000-8000-000000000001';
const versionId = '00000000-0000-4000-8000-000000000002';
const at = new Date('2026-10-01T00:00:00Z');
const draft = {
  policy_decisions: [],
  id: versionId,
  policy_id: id,
  version_number: '1.0',
  content: 'Saved policy content',
  change_summary: null,
  status: 'DRAFT',
  author_user_id: id,
  created_at: at,
  policies_policy_versions_policy_idTopolicies: {
    policy_code: 'POL-TEST',
    title: 'Test policy',
    description: null,
    owner_user_id: id,
    status: 'DRAFT',
    created_at: at,
    updated_at: at,
  },
};
const app = createApp();
const url = `/api/v1/compliance/policies/${id}/drafts/${versionId}`;
const token = jwt.sign({ type: 'access' }, env.JWT_ACCESS_SECRET, {
  algorithm: 'HS256',
  issuer: 'securaai-api',
  audience: 'securaai-client',
  subject: id,
  expiresIn: '15m',
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.actor.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  mocks.findFirst.mockResolvedValue(draft);
});
it('serves detail through the real route, service and scoped repository instead of 501', async () => {
  const response = await request(app).get(url).auth(token, { type: 'bearer' });
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({
    success: true,
    data: {
      policyId: id,
      policyCode: 'POL-TEST',
      title: 'Test policy',
      ownerUserId: id,
      policyStatus: 'DRAFT',
      description: null,
      updatedAt: at.toISOString(),
      version: {
        id: versionId,
        content: draft.content,
        versionNumber: '1.0',
        status: 'DRAFT',
        changeSummary: null,
      },
    },
  });
  expect(mocks.findFirst).toHaveBeenCalledWith({
    where: {
      id: versionId,
      policy_id: id,
      status: 'DRAFT',
      author_user_id: id,
      policies_policy_versions_policy_idTopolicies: { owner_user_id: id, status: 'DRAFT' },
    },
    select: expect.objectContaining({ content: true, author_user_id: true }),
  });
});
it('requires authentication', async () => {
  expect((await request(app).get(url)).status).toBe(401);
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
it('includes the latest saved revision feedback with its author and timestamp', async () => {
  mocks.findFirst.mockResolvedValue({
    ...draft,
    policy_decisions: [
      {
        id: versionId,
        comment: 'Clarify the reporting responsibilities.',
        decided_at: at,
        actor_user_id: id,
        users: { full_name: 'Reviewing Admin' },
      },
    ],
  });
  const response = await request(app).get(url).auth(token, { type: 'bearer' });
  expect(response.status).toBe(200);
  expect(response.body.data.revisionRequest).toEqual({
    id: versionId,
    reason: 'Clarify the reporting responsibilities.',
    requestedAt: at.toISOString(),
    requestedBy: { id, name: 'Reviewing Admin' },
  });
  expect(mocks.findFirst.mock.calls[0]?.[0].select.policy_decisions).toEqual({
    where: { action: 'REVISION_REQUESTED' },
    orderBy: [{ decided_at: 'desc' }, { id: 'desc' }],
    take: 1,
    select: {
      id: true,
      comment: true,
      decided_at: true,
      actor_user_id: true,
      users: { select: { full_name: true } },
    },
  });
});
it('returns null rather than fabricated feedback for a draft without revision requests', async () => {
  const result = await policyComplianceService.getOwnDraft(id, id, versionId);
  expect(result.revisionRequest).toBeNull();
});
it.each(['ADMIN', 'EMPLOYEE', 'EXECUTIVE'])('denies %s before querying content', async (role) => {
  mocks.actor.mockResolvedValue({ role, status: 'ACTIVE' });
  expect((await request(app).get(url).auth(token, { type: 'bearer' })).status).toBe(403);
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
it.each([null, { role: 'SECURITY_OFFICER', status: 'INACTIVE' }])(
  'denies missing or inactive actors',
  async (actor) => {
    mocks.actor.mockResolvedValue(actor);
    await expect(policyComplianceService.getOwnDraft(id, id, versionId)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  },
);
it('returns nondisclosing 404 when the scoped query finds no accessible draft', async () => {
  mocks.findFirst.mockResolvedValue(null);
  const response = await request(app).get(url).auth(token, { type: 'bearer' });
  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe('POLICY_DRAFT_NOT_FOUND');
  expect(response.body.data).toBeUndefined();
});
it.each([
  { policyId: 'invalid', versionId },
  { policyId: id, versionId: 'invalid' },
])('validates both identifiers', async (params) => {
  expect(editPolicyDraftParamsSchema.safeParse(params).success).toBe(false);
  const response = await request(app)
    .get(`/api/v1/compliance/policies/${params.policyId}/drafts/${params.versionId}`)
    .auth(token, { type: 'bearer' });
  expect(response.status).toBe(422);
  expect(mocks.findFirst).not.toHaveBeenCalled();
});
it('documents the detail as an implemented authenticated read', () => {
  expect(openApiSpec.paths['/compliance/policies/{policyId}/drafts/{versionId}'].get).toMatchObject(
    {
      security: [{ bearerAuth: [] }],
      responses: { '200': expect.any(Object), '404': expect.any(Object) },
    },
  );
});

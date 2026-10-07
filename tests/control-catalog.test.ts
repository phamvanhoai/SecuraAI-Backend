import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
const { tx, transaction } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    users: { findUnique: vi.fn(), findMany: vi.fn() },
    security_controls: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    audit_logs: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});
vi.mock('../src/database/prisma.js', () => ({ prisma: { ...tx, $transaction: transaction } }));
import { controlCatalogService } from '../src/modules/policy-compliance-control/control-catalog.service.js';
import {
  createControlSchema,
  editControlSchema,
} from '../src/modules/policy-compliance-control/dto/manage-control.dto.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
const id = '00000000-0000-4000-8000-000000000001';
const controlId = '00000000-0000-4000-8000-000000000002';
const at = new Date('2026-10-07T01:00:00.123Z');
const record = {
  id: controlId,
  control_code: 'CTRL-MFA',
  name: 'Administrator MFA',
  description: 'Require MFA for privileged access',
  owner_user_id: null,
  applicability: 'APPLICABLE' as const,
  implementation_status: 'NOT_IMPLEMENTED' as const,
  created_at: at,
  updated_at: at,
  users_security_controls_owner_user_idTousers: null,
  _count: { control_assessments: 0 },
};
const body = {
  controlCode: 'CTRL-MFA',
  name: record.name,
  description: record.description,
  ownerUserId: null,
  applicability: 'applicable' as const,
  implementationStatus: 'not_implemented' as const,
};
async function editInput() {
  const current = await controlCatalogService.get(id, controlId);
  return {
    name: body.name,
    description: body.description,
    ownerUserId: null,
    applicability: body.applicability,
    implementationStatus: body.implementationStatus,
    reason: 'Correct the control description',
    expectedUpdatedAt: current.updatedAt.toISOString(),
    expectedRevision: current.revision,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  tx.security_controls.findUnique.mockResolvedValue(record);
  tx.security_controls.findFirst.mockResolvedValue(null);
  tx.security_controls.create.mockResolvedValue(record);
  tx.security_controls.update.mockResolvedValue({ ...record, name: 'Updated administrator MFA' });
  tx.audit_logs.create.mockResolvedValue({});
  tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join('').includes('to_char') ? [{ version: '2026-10-07 01:00:00.123456' }] : [],
  );
});
describe('Control catalog boundaries', () => {
  it('normalizes code and accepts an unassigned owner', () =>
    expect(createControlSchema.parse({ ...body, controlCode: ' ctrl-mfa ' }).controlCode).toBe(
      'CTRL-MFA',
    ));
  it.each([
    { controlCode: 'bad code' },
    { name: ' ' },
    { description: 'short' },
    { ownerUserId: 'bad' },
    { applicability: 'unknown' },
    { implementationStatus: 'unknown' },
    { effectiveness: 100 },
    { evidenceIds: [] },
    { riskId: controlId },
  ])('rejects invalid or out-of-scope fields %j', (value) =>
    expect(createControlSchema.safeParse({ ...body, ...value }).success).toBe(false),
  );
  it('rejects changing the code, missing reason or missing version in Edit', async () => {
    const input = await editInput();
    expect(editControlSchema.safeParse({ ...input, controlCode: 'NEW' }).success).toBe(false);
    expect(editControlSchema.safeParse({ ...input, reason: ' ' }).success).toBe(false);
    expect(editControlSchema.safeParse({ ...input, expectedRevision: undefined }).success).toBe(
      false,
    );
  });
});
describe('Control catalog business rules', () => {
  it('creates only the catalog record and its audit in one transaction', async () => {
    const result = await controlCatalogService.create(id, body);
    expect(result.configurationLocked).toBe(false);
    expect(tx.security_controls.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: body.name,
          description: body.description,
          owner_user_id: null,
          applicability: 'APPLICABLE',
          implementation_status: 'NOT_IMPLEMENTED',
          control_code: 'CTRL-MFA',
          created_by: id,
        },
      }),
    );
    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CONTROL_CREATED', actor_user_id: id }),
      }),
    );
  });
  it.each(['EMPLOYEE', 'EXECUTIVE', 'ADMIN'])('denies catalog mutation by %s', async (role) => {
    tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
    await expect(controlCatalogService.create(id, body)).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.security_controls.create).not.toHaveBeenCalled();
  });
  it('rejects an inactive actor and rechecks authorization inside the write', async () => {
    tx.users.findUnique
      .mockResolvedValueOnce({ role: 'SECURITY_OFFICER', status: 'ACTIVE' })
      .mockResolvedValueOnce({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(controlCatalogService.create(id, body)).rejects.toMatchObject({ statusCode: 403 });
    tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'INACTIVE' });
    await expect(controlCatalogService.create(id, body)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('rejects case-insensitive duplicate codes without an audit', async () => {
    tx.security_controls.findFirst.mockResolvedValue({ id: controlId });
    await expect(controlCatalogService.create(id, body)).rejects.toMatchObject({
      code: 'CONTROL_CODE_EXISTS',
    });
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('rejects an inactive new owner', async () => {
    tx.users.findUnique
      .mockResolvedValueOnce({ role: 'SECURITY_OFFICER', status: 'ACTIVE' })
      .mockResolvedValueOnce({ role: 'SECURITY_OFFICER', status: 'ACTIVE' })
      .mockResolvedValueOnce({ role: 'EMPLOYEE', status: 'INACTIVE' });
    await expect(
      controlCatalogService.create(id, { ...body, ownerUserId: controlId }),
    ).rejects.toMatchObject({ code: 'INVALID_CONTROL_OWNER' });
  });
  it('updates metadata with an immutable code and audit reason', async () => {
    await controlCatalogService.edit(id, controlId, {
      ...(await editInput()),
      name: 'Updated administrator MFA',
    });
    const call = tx.security_controls.update.mock.calls[0]?.[0];
    expect(call.data).not.toHaveProperty('control_code');
    expect(call.data).not.toHaveProperty('control_assessments');
    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CONTROL_UPDATED',
          after_data: expect.objectContaining({ reason: 'Correct the control description' }),
        }),
      }),
    );
  });
  it('leaves a no-op unchanged without extra audit or timestamp', async () => {
    await controlCatalogService.edit(id, controlId, await editInput());
    expect(tx.security_controls.update).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('rejects stale microsecond revisions even when the JS date is unchanged', async () => {
    const input = await editInput();
    tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) =>
      strings.join('').includes('to_char') ? [{ version: '2026-10-07 01:00:00.123457' }] : [],
    );
    await expect(
      controlCatalogService.edit(id, controlId, { ...input, name: 'Updated administrator MFA' }),
    ).rejects.toMatchObject({ code: 'CONTROL_STALE' });
    expect(tx.security_controls.update).not.toHaveBeenCalled();
  });
  it('locks applicability and implementation after assessment, but permits metadata correction', async () => {
    tx.security_controls.findUnique.mockResolvedValue({
      ...record,
      _count: { control_assessments: 1 },
    });
    const input = await editInput();
    await expect(
      controlCatalogService.edit(id, controlId, { ...input, implementationStatus: 'implemented' }),
    ).rejects.toMatchObject({ code: 'CONTROL_CONFIGURATION_LOCKED' });
    await controlCatalogService.edit(id, controlId, {
      ...input,
      name: 'Updated administrator MFA',
    });
    expect(tx.security_controls.update).toHaveBeenCalledTimes(1);
  });
  it('preserves an unchanged inactive owner and validates a replacement', async () => {
    tx.security_controls.findUnique.mockResolvedValue({
      ...record,
      owner_user_id: controlId,
      users_security_controls_owner_user_idTousers: {
        id: controlId,
        full_name: 'Prior owner',
        status: 'INACTIVE',
      },
    });
    const input = await editInput();
    await controlCatalogService.edit(id, controlId, {
      ...input,
      ownerUserId: controlId,
      name: 'Updated administrator MFA',
    });
    expect(tx.users.findUnique.mock.calls.every((call) => call[0].where.id === id)).toBe(true);
  });
  it('bounds owner search and discloses no credentials', async () => {
    tx.security_controls.findMany.mockResolvedValue([]);
    tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    tx.users.findMany.mockResolvedValue([{ id, full_name: 'Demo owner' }]);
    expect(await controlCatalogService.owners(id, 'Demo')).toEqual({
      items: [{ id, fullName: 'Demo owner' }],
    });
    expect(tx.users.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        select: { id: true, full_name: true },
        where: expect.objectContaining({
          status: 'ACTIVE',
          role: { in: ['EMPLOYEE', 'SECURITY_OFFICER'] },
        }),
      }),
    );
  });
  it('propagates audit failure through the transaction rather than returning false success', async () => {
    tx.audit_logs.create.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(controlCatalogService.create(id, body)).rejects.toThrow('Audit unavailable');
    expect(transaction).toHaveBeenCalled();
  });
  it('returns not found for a missing Control', async () => {
    tx.security_controls.findUnique.mockResolvedValue(null);
    await expect(controlCatalogService.get(id, controlId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
describe('Control catalog HTTP', () => {
  const token = jwt.sign({ type: 'access', role: 'SECURITY_OFFICER' }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: 'securaai-api',
    audience: 'securaai-client',
    subject: id,
    expiresIn: '15m',
  });
  const app = createApp();
  it('requires authentication and validates strict payloads', async () => {
    expect((await request(app).post('/api/v1/compliance/controls').send(body)).status).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/v1/compliance/controls')
          .set('Authorization', `Bearer ${token}`)
          .send({ ...body, effectiveness: 100 })
      ).status,
    ).toBe(422);
  });
  it('returns the created control contract', async () => {
    const response = await request(app)
      .post('/api/v1/compliance/controls')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      controlCode: 'CTRL-MFA',
      configurationLocked: false,
      owner: null,
    });
    expect(response.body.data.revision).toMatch(/^[a-f0-9]{64}$/);
  });
  it('returns forbidden based on the database actor rather than token role', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    expect(
      (
        await request(app)
          .get(`/api/v1/compliance/controls/${controlId}`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(403);
  });
  it('supports PATCH and rejects stale version and unbounded owner input', async () => {
    const input = await editInput();
    const response = await request(app)
      .patch(`/api/v1/compliance/controls/${controlId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, name: 'Updated administrator MFA' });
    expect(response.status).toBe(200);
    const stale = await request(app)
      .patch(`/api/v1/compliance/controls/${controlId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...input, expectedRevision: '0'.repeat(64) });
    expect(stale.status).toBe(409);
    expect(
      (
        await request(app)
          .get(`/api/v1/compliance/controls/owner-options?q=${'a'.repeat(101)}`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(422);
  });
});

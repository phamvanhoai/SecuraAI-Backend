import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const { tx, transaction } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    users: { findUnique: vi.fn() },
    security_controls: { findUnique: vi.fn() },
    evidence_items: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    control_evidence_links: { findUnique: vi.fn(), create: vi.fn() },
    audit_logs: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});
vi.mock('../src/database/prisma.js', () => ({ prisma: { ...tx, $transaction: transaction } }));
import { controlEvidenceService } from '../src/modules/policy-compliance-control/control-evidence.service.js';
import {
  addControlEvidenceSchema,
  linkControlEvidenceSchema,
  listControlEvidenceSchema,
} from '../src/modules/policy-compliance-control/dto/control-evidence.dto.js';
import { isControlEvidenceUsable } from '../src/modules/policy-compliance-control/control-evidence.rules.js';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
const actorId = '00000000-0000-4000-8000-000000000001';
const controlId = '00000000-0000-4000-8000-000000000002';
const evidenceId = '00000000-0000-4000-8000-000000000003';
const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
const input = {
  requestId: evidenceId,
  name: 'MFA test report',
  source: 'Administrator sign-in test',
  description: 'Ten administrative accounts were tested; all required MFA.',
  documentUrl: 'https://docs.example.test/reports/mfa',
  collectedAt: past.toISOString(),
  validUntil: null,
};
const item = {
  id: evidenceId,
  name: input.name,
  source: input.source,
  description: input.description,
  storage_uri: input.documentUrl,
  owner_user_id: actorId,
  collected_at: past,
  valid_from: null,
  valid_until: null,
  status: 'ACTIVE',
  reviewed_at: null,
  created_at: past,
  users_evidence_items_owner_user_idTousers: { id: actorId, full_name: 'Demo owner' },
  users_evidence_items_reviewed_byTousers: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
  tx.security_controls.findUnique.mockResolvedValue({
    id: controlId,
    name: 'MFA enforcement',
    control_code: 'CTRL-MFA',
    owner_user_id: actorId,
  });
  tx.evidence_items.findUnique.mockResolvedValue(null);
  tx.evidence_items.findFirst.mockResolvedValue(null);
  tx.evidence_items.create.mockResolvedValue(item);
  tx.evidence_items.count.mockResolvedValue(0);
  tx.evidence_items.findMany.mockResolvedValue([]);
  tx.control_evidence_links.findUnique.mockResolvedValue(null);
  tx.control_evidence_links.create.mockResolvedValue({});
  tx.audit_logs.create.mockResolvedValue({});
  tx.$queryRaw.mockResolvedValue([]);
});
describe('Evidence DTOs and usability', () => {
  it('accepts reference metadata but does not accept fabricated review/file fields', () => {
    expect(addControlEvidenceSchema.parse(input)).toEqual(input);
    for (const field of [
      'reviewedBy',
      'reviewedAt',
      'status',
      'ownerUserId',
      'fileSize',
      'integrityHash',
      'effectiveness',
    ])
      expect(addControlEvidenceSchema.safeParse({ ...input, [field]: actorId }).success).toBe(
        false,
      );
  });
  it.each([
    'http://docs.example.test/report',
    'javascript:alert(1)',
    'file:///D:/report',
    'https://user:pass@docs.example.test/report',
    'https://docs.example.test/a\nb',
  ])('rejects unsafe document reference %s', (url) =>
    expect(addControlEvidenceSchema.safeParse({ ...input, documentUrl: url }).success).toBe(false),
  );
  it('normalizes HTTPS references without accessing the network', () =>
    expect(
      addControlEvidenceSchema.parse({
        ...input,
        documentUrl: ' https://DOCS.example.test:443/reports/mfa ',
      }).documentUrl,
    ).toBe(input.documentUrl));
  it('validates date format, period ordering and required reason', () => {
    expect(addControlEvidenceSchema.safeParse({ ...input, collectedAt: 'yesterday' }).success).toBe(
      false,
    );
    expect(
      addControlEvidenceSchema.safeParse({
        ...input,
        validUntil: new Date(past.getTime() - 1).toISOString(),
      }).success,
    ).toBe(false);
    expect(linkControlEvidenceSchema.safeParse({ evidenceId, reason: ' ' }).success).toBe(false);
    expect(
      linkControlEvidenceSchema.safeParse({
        evidenceId,
        reason: 'Supports MFA implementation',
        status: 'ACTIVE',
      }).success,
    ).toBe(false);
  });
  it('bounds pagination/search and checks end-exclusive expiry/future validity', () => {
    expect(listControlEvidenceSchema.parse({})).toEqual({
      page: 1,
      limit: 10,
      q: '',
      view: 'linked',
    });
    expect(listControlEvidenceSchema.safeParse({ limit: 11 }).success).toBe(false);
    expect(listControlEvidenceSchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(listControlEvidenceSchema.safeParse({ view: 'all' }).success).toBe(false);
    const now = new Date();
    expect(isControlEvidenceUsable({ ...item, valid_until: now }, now)).toBe(false);
    expect(isControlEvidenceUsable({ ...item, valid_from: future }, now)).toBe(false);
    expect(isControlEvidenceUsable({ ...item, collected_at: future }, now)).toBe(false);
    expect(isControlEvidenceUsable(item, now)).toBe(true);
  });
});
describe('Add Evidence transactions', () => {
  it('creates evidence/link/audit atomically without marking a review or creating an assessment', async () => {
    const result = await controlEvidenceService.add(actorId, controlId, input);
    expect(result).toMatchObject({
      created: true,
      evidence: { id: evidenceId, usable: true, reviewedAt: null, reviewedBy: null },
    });
    expect(tx.evidence_items.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          owner_user_id: actorId,
          storage_uri: input.documentUrl,
          status: 'ACTIVE',
        }),
      }),
    );
    expect(tx.evidence_items.create.mock.calls[0]?.[0].data).not.toHaveProperty('reviewed_by');
    expect(tx.control_evidence_links.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          control_id: controlId,
          evidence_id: evidenceId,
          linked_by: actorId,
        }),
      }),
    );
    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CONTROL_EVIDENCE_ADDED', actor_user_id: actorId }),
      }),
    );
    expect(JSON.stringify(tx.audit_logs.create.mock.calls)).not.toContain(input.documentUrl);
  });
  it('allows the current Employee Control Owner but not an unrelated Employee', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await controlEvidenceService.add(actorId, controlId, input);
    tx.security_controls.findUnique.mockResolvedValue({
      id: controlId,
      name: 'Other',
      control_code: 'CTRL-OTHER',
      owner_user_id: evidenceId,
    });
    await expect(controlEvidenceService.add(actorId, controlId, input)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
  it.each(['ADMIN', 'EXECUTIVE'])('denies %s even when assigned as owner', async (role) => {
    tx.users.findUnique.mockResolvedValue({ role, status: 'ACTIVE' });
    await expect(controlEvidenceService.add(actorId, controlId, input)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(tx.evidence_items.create).not.toHaveBeenCalled();
  });
  it('denies a disabled actor and missing Control', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'LOCKED' });
    await expect(controlEvidenceService.add(actorId, controlId, input)).rejects.toMatchObject({
      statusCode: 401,
    });
    tx.users.findUnique.mockResolvedValue({ role: 'SECURITY_OFFICER', status: 'ACTIVE' });
    tx.security_controls.findUnique.mockResolvedValue(null);
    await expect(controlEvidenceService.add(actorId, controlId, input)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
  it('rejects future collection and already-expired validity at write time', async () => {
    await expect(
      controlEvidenceService.add(actorId, controlId, {
        ...input,
        collectedAt: future.toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_FUTURE_COLLECTION' });
    await expect(
      controlEvidenceService.add(actorId, controlId, {
        ...input,
        validUntil: new Date(Date.now() - 1000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID_VALIDITY' });
    expect(tx.evidence_items.create).not.toHaveBeenCalled();
  });
  it('replays an identical request without extra evidence/link/audit', async () => {
    tx.evidence_items.findUnique.mockResolvedValue(item);
    tx.control_evidence_links.findUnique.mockResolvedValue({ linked_by: actorId });
    expect(await controlEvidenceService.add(actorId, controlId, input)).toMatchObject({
      created: false,
    });
    expect(tx.evidence_items.create).not.toHaveBeenCalled();
    expect(tx.control_evidence_links.create).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('does not reuse another user/request payload or attach its evidence silently', async () => {
    tx.evidence_items.findUnique.mockResolvedValue({ ...item, owner_user_id: controlId });
    await expect(controlEvidenceService.add(actorId, controlId, input)).rejects.toMatchObject({
      code: 'EVIDENCE_REQUEST_CONFLICT',
    });
    tx.evidence_items.findUnique.mockResolvedValue(item);
    tx.control_evidence_links.findUnique.mockResolvedValue({ linked_by: actorId });
    await expect(
      controlEvidenceService.add(actorId, controlId, {
        ...input,
        description: 'A different test result',
      }),
    ).rejects.toMatchObject({ code: 'EVIDENCE_REQUEST_CONFLICT' });
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
  });
  it('rejects an accessible duplicate document/version and instructs reuse', async () => {
    tx.evidence_items.findFirst.mockResolvedValue({ id: evidenceId });
    await expect(controlEvidenceService.add(actorId, controlId, input)).rejects.toMatchObject({
      code: 'EVIDENCE_ALREADY_EXISTS',
    });
    expect(tx.evidence_items.create).not.toHaveBeenCalled();
  });
  it('fails the whole operation if the audit write fails', async () => {
    tx.audit_logs.create.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(controlEvidenceService.add(actorId, controlId, input)).rejects.toThrow(
      'Audit unavailable',
    );
    expect(transaction).toHaveBeenCalled();
  });
});
describe('Link Evidence', () => {
  const link = { evidenceId, reason: 'This report tests the administrative MFA requirement' };
  beforeEach(() => tx.evidence_items.findFirst.mockResolvedValue(item));
  it('reuses an existing record and captures linker/time/relevance', async () => {
    expect(await controlEvidenceService.link(actorId, controlId, link)).toMatchObject({
      linked: true,
    });
    expect(tx.evidence_items.create).not.toHaveBeenCalled();
    expect(tx.audit_logs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CONTROL_EVIDENCE_LINKED',
          after_data: { controlId, evidenceId, reason: link.reason },
        }),
      }),
    );
    expect(transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });
  it('does not leak evidence existence when an item is outside ownership scope', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    tx.evidence_items.findFirst.mockResolvedValue(null);
    await expect(controlEvidenceService.link(actorId, controlId, link)).rejects.toMatchObject({
      code: 'EVIDENCE_NOT_AVAILABLE',
    });
    expect(tx.evidence_items.findFirst.mock.calls[0]?.[0].where.AND[0]).toEqual({
      OR: [
        { owner_user_id: actorId },
        { control_evidence_links: { some: { security_controls: { owner_user_id: actorId } } } },
      ],
    });
    expect(tx.control_evidence_links.create).not.toHaveBeenCalled();
  });
  it.each(['EXPIRED', 'INVALID', 'ARCHIVED'])(
    'rejects %s evidence even when a client submits its ID',
    async (status) => {
      tx.evidence_items.findFirst.mockResolvedValue({ ...item, status });
      await expect(controlEvidenceService.link(actorId, controlId, link)).rejects.toMatchObject({
        code: 'EVIDENCE_NOT_USABLE',
      });
      expect(tx.control_evidence_links.create).not.toHaveBeenCalled();
    },
  );
  it('rejects Active evidence with expired or future validity', async () => {
    tx.evidence_items.findFirst.mockResolvedValue({ ...item, valid_until: past });
    await expect(controlEvidenceService.link(actorId, controlId, link)).rejects.toMatchObject({
      code: 'EVIDENCE_NOT_USABLE',
    });
    tx.evidence_items.findFirst.mockResolvedValue({ ...item, valid_from: future });
    await expect(controlEvidenceService.link(actorId, controlId, link)).rejects.toMatchObject({
      code: 'EVIDENCE_NOT_USABLE',
    });
  });
  it('is idempotent for an already-linked pair without duplicate audit', async () => {
    tx.control_evidence_links.findUnique.mockResolvedValue({ evidence_id: evidenceId });
    expect(await controlEvidenceService.link(actorId, controlId, link)).toMatchObject({
      linked: false,
    });
    expect(tx.audit_logs.create).not.toHaveBeenCalled();
    expect(tx.control_evidence_links.create).not.toHaveBeenCalled();
  });
  it('normalizes a concurrency conflict without retrying a mutation', async () => {
    tx.control_evidence_links.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Conflict', {
        code: 'P2034',
        clientVersion: '6.12.0',
      }),
    );
    await expect(controlEvidenceService.link(actorId, controlId, link)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(tx.control_evidence_links.create).toHaveBeenCalledTimes(1);
  });
});
describe('Scoped list/search', () => {
  it('returns linked records for history including expired items, sanitizing old unsafe URLs', async () => {
    tx.evidence_items.count.mockResolvedValue(1);
    tx.evidence_items.findMany.mockResolvedValue([
      {
        ...item,
        storage_uri: 'javascript:alert(1)',
        valid_until: past,
        control_evidence_links: [
          { linked_at: past, users: { id: actorId, full_name: 'Demo owner' } },
        ],
      },
    ]);
    const result = await controlEvidenceService.list(
      actorId,
      controlId,
      listControlEvidenceSchema.parse({}),
    );
    expect(result).toMatchObject({
      canAdd: true,
      canLink: true,
      items: [{ usable: false, documentUrl: null, reviewedAt: null, linkedBy: { id: actorId } }],
    });
    expect(tx.evidence_items.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 0 }),
    );
  });
  it('scopes candidates in BE, excludes linked/expired/future evidence, and bounds search', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    await controlEvidenceService.list(
      actorId,
      controlId,
      listControlEvidenceSchema.parse({ view: 'available', q: 'MFA', page: 2 }),
    );
    const query = tx.evidence_items.findMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({ take: 10, skip: 10 });
    expect(query.where.AND[0]).toMatchObject({
      OR: [
        { owner_user_id: actorId },
        { control_evidence_links: { some: { security_controls: { owner_user_id: actorId } } } },
      ],
    });
    expect(query.where.AND[1]).toMatchObject({
      status: 'ACTIVE',
      collected_at: { lte: expect.any(Date) },
      control_evidence_links: { none: { control_id: controlId } },
    });
    expect(query.where.AND[1].AND).toHaveLength(2);
    expect(JSON.stringify(query.select)).not.toContain('password');
  });
});
describe('Evidence HTTP contracts', () => {
  const app = createApp();
  const token = jwt.sign({ type: 'access', role: 'SECURITY_OFFICER' }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    issuer: 'securaai-api',
    audience: 'securaai-client',
    subject: actorId,
    expiresIn: '15m',
  });
  const path = `/api/v1/compliance/controls/${controlId}`;
  it('requires authentication and strict input validation', async () => {
    expect((await request(app).post(`${path}/evidence`).send(input)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(`${path}/evidence`)
          .set('Authorization', `Bearer ${token}`)
          .send({ ...input, reviewedBy: actorId })
      ).status,
    ).toBe(422);
    expect(
      (await request(app).get(`${path}/evidence?limit=11`).set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(422);
  });
  it('returns real metadata and a link, not an assessment or file upload result', async () => {
    const response = await request(app)
      .post(`${path}/evidence`)
      .set('Authorization', `Bearer ${token}`)
      .send(input);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      created: true,
      evidence: { documentUrl: input.documentUrl, reviewedAt: null },
    });
    expect(response.body.data).not.toHaveProperty('effectiveness');
  });
  it('checks DB ownership despite an elevated JWT claim and masks inaccessible IDs', async () => {
    tx.users.findUnique.mockResolvedValue({ role: 'EMPLOYEE', status: 'ACTIVE' });
    tx.security_controls.findUnique.mockResolvedValue({
      id: controlId,
      control_code: 'CTRL-MFA',
      name: 'MFA',
      owner_user_id: evidenceId,
    });
    expect(
      (await request(app).get(`${path}/evidence`).set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);
    tx.security_controls.findUnique.mockResolvedValue({
      id: controlId,
      control_code: 'CTRL-MFA',
      name: 'MFA',
      owner_user_id: actorId,
    });
    tx.evidence_items.findFirst.mockResolvedValue(null);
    expect(
      (
        await request(app)
          .post(`${path}/evidence-links`)
          .set('Authorization', `Bearer ${token}`)
          .send({ evidenceId, reason: 'Related to administrative MFA' })
      ).status,
    ).toBe(404);
  });
});

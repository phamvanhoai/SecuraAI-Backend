import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateApiKey,
  requireApiKeyScope,
} from '../src/common/middleware/authenticate-api-key.js';
import { prisma } from '../src/database/prisma.js';

type ApiKeyDbRecord = {
  id: string;
  name: string;
  key_prefix: string;
  secret_hash: string;
  status: 'ACTIVE' | 'INACTIVE' | 'REVOKED' | 'EXPIRED' | 'ROTATED';
  expires_at: Date | null;
  event_source_id: string | null;
  event_sources: {
    id: string;
    name: string;
    status: string;
  } | null;
  api_key_scopes: {
    scope_code: string;
  }[];
};

describe('authenticateApiKey middleware & requireApiKeyScope guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env['SECURAAI_INGEST_TOKEN'];
    delete process.env['WAZUH_INGEST_TOKEN'];
  });

  function createMockReqRes(headers: Record<string, string> = {}) {
    const req = {
      headers,
      ip: '192.168.1.100',
    } as unknown as Request;

    const res = {
      locals: {},
    } as unknown as Response;

    const next = vi.fn();

    return { req, res, next };
  }

  function getNextError(next: ReturnType<typeof vi.fn>): { statusCode?: number; message?: string } | undefined {
    const firstCall = next.mock.calls[0];
    return firstCall ? (firstCall[0] as { statusCode?: number; message?: string }) : undefined;
  }

  it('rejects request with 401 when no token is provided in headers', async () => {
    const { req, res, next } = createMockReqRes();

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toContain('Missing API key');
  });

  it('rejects request with 401 when token format is invalid', async () => {
    const { req, res, next } = createMockReqRes({
      'x-api-key': 'invalid_token_format',
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toBe('Invalid or unauthorized API key');
  });

  it('accepts configured static environment token and assigns events:ingest scope', async () => {
    process.env['SECURAAI_INGEST_TOKEN'] = 'secret-static-env-token';

    const { req, res, next } = createMockReqRes({
      'x-securaai-ingest-key': 'secret-static-env-token',
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.apiKey).toBeDefined();
    expect(res.locals.apiKey?.scopes).toEqual(['events:ingest']);
    expect(res.locals.apiKey?.id).toBe('static-env-token');
  });

  it('rejects with 401 when key prefix is not found in database', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(null);

    const { req, res, next } = createMockReqRes({
      'x-api-key': rawSecret,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toBe('Invalid or unauthorized API key');
  });

  it('rejects with 401 when key status is REVOKED', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(rawSecret).digest('hex');

    const mockRecord: ApiKeyDbRecord = {
      id: 'key-uuid-1',
      name: 'Revoked Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: hash,
      status: 'REVOKED',
      expires_at: null,
      event_source_id: null,
      event_sources: null,
      api_key_scopes: [{ scope_code: 'events:ingest' }],
    };

    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>,
    );

    const { req, res, next } = createMockReqRes({
      'x-api-key': rawSecret,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toBe('Invalid or unauthorized API key');
  });

  it('rejects with 401 when key status is INACTIVE', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(rawSecret).digest('hex');

    const mockRecord: ApiKeyDbRecord = {
      id: 'key-uuid-1',
      name: 'Inactive Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: hash,
      status: 'INACTIVE',
      expires_at: null,
      event_source_id: null,
      event_sources: null,
      api_key_scopes: [{ scope_code: 'events:ingest' }],
    };

    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>,
    );

    const { req, res, next } = createMockReqRes({
      'x-api-key': rawSecret,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toBe('Invalid or unauthorized API key');
  });

  it('rejects with 401 when key has expired', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(rawSecret).digest('hex');

    const mockRecord: ApiKeyDbRecord = {
      id: 'key-uuid-1',
      name: 'Expired Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: hash,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() - 3600000), // 1 hour ago
      event_source_id: null,
      event_sources: null,
      api_key_scopes: [{ scope_code: 'events:ingest' }],
    };

    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>,
    );

    const { req, res, next } = createMockReqRes({
      'x-api-key': rawSecret,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toBe('Invalid or unauthorized API key');
  });

  it('rejects with 401 when secret hash does not match', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const differentHash = createHash('sha256').update('different_secret').digest('hex');

    const mockRecord: ApiKeyDbRecord = {
      id: 'key-uuid-1',
      name: 'Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: differentHash,
      status: 'ACTIVE',
      expires_at: null,
      event_source_id: null,
      event_sources: null,
      api_key_scopes: [{ scope_code: 'events:ingest' }],
    };

    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>,
    );

    const { req, res, next } = createMockReqRes({
      'x-api-key': rawSecret,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(401);
    expect(error?.message).toBe('Invalid or unauthorized API key');
  });

  it('rejects with 403 when associated event source is inactive', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(rawSecret).digest('hex');

    const mockRecord: ApiKeyDbRecord = {
      id: 'key-uuid-1',
      name: 'Active Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: hash,
      status: 'ACTIVE',
      expires_at: null,
      event_source_id: 'src-1',
      event_sources: {
        id: 'src-1',
        name: 'Wazuh Disabled',
        status: 'INACTIVE',
      },
      api_key_scopes: [{ scope_code: 'events:ingest' }],
    };

    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>,
    );

    const { req, res, next } = createMockReqRes({
      'x-api-key': rawSecret,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error?.statusCode).toBe(403);
    expect(error?.message).toContain('inactive or disabled');
  });

  it('successfully authenticates with valid SHA-256 hash and attaches context to res.locals', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const hash = createHash('sha256').update(rawSecret).digest('hex');

    const mockRecord: ApiKeyDbRecord = {
      id: 'key-uuid-1',
      name: 'Valid Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: hash,
      status: 'ACTIVE',
      expires_at: new Date(Date.now() + 86400000),
      event_source_id: 'src-uuid-1',
      event_sources: {
        id: 'src-uuid-1',
        name: 'Wazuh Ingest Source',
        status: 'ACTIVE',
      },
      api_key_scopes: [
        { scope_code: 'events:ingest' },
        { scope_code: 'events:read' },
      ],
    };

    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>,
    );

    const updateSpy = vi
      .spyOn(prisma.integration_api_keys, 'update')
      .mockResolvedValue(
        mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.update>>,
      );

    const { req, res, next } = createMockReqRes({
      authorization: `Bearer ${rawSecret}`,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.apiKey).toEqual({
      id: 'key-uuid-1',
      name: 'Valid Key',
      eventSourceId: 'src-uuid-1',
      eventSource: {
        id: 'src-uuid-1',
        name: 'Wazuh Ingest Source',
        status: 'ACTIVE',
      },
      scopes: ['events:ingest', 'events:read'],
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'key-uuid-1' },
      }),
    );
  });

  it('successfully authenticates with valid Argon2id hash', async () => {
    const rawSecret = `sec_live_${randomBytes(24).toString('hex')}`;
    const argonHash = await argon2.hash(rawSecret);

    const mockRecord: ApiKeyDbRecord = {
      id: 'key-uuid-2',
      name: 'Argon2 Key',
      key_prefix: rawSecret.slice(0, 19),
      secret_hash: argonHash,
      status: 'ACTIVE',
      expires_at: null,
      event_source_id: null,
      event_sources: null,
      api_key_scopes: [{ scope_code: 'events:ingest' }],
    };

    vi.spyOn(prisma.integration_api_keys, 'findUnique').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.findUnique>>,
    );

    vi.spyOn(prisma.integration_api_keys, 'update').mockResolvedValue(
      mockRecord as unknown as Awaited<ReturnType<typeof prisma.integration_api_keys.update>>,
    );

    const { req, res, next } = createMockReqRes({
      'x-api-key': rawSecret,
    });

    await authenticateApiKey(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.locals.apiKey?.id).toBe('key-uuid-2');
  });

  describe('requireApiKeyScope guard', () => {
    it('allows access when required scope is present in res.locals.apiKey', () => {
      const { req, res, next } = createMockReqRes();
      res.locals.apiKey = {
        id: 'key-1',
        name: 'Key',
        eventSourceId: null,
        eventSource: null,
        scopes: ['events:ingest', 'alerts:read'],
      };

      const guard = requireApiKeyScope('events:ingest');
      guard(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects with 403 Forbidden when required scope is missing', () => {
      const { req, res, next } = createMockReqRes();
      res.locals.apiKey = {
        id: 'key-1',
        name: 'Key',
        eventSourceId: null,
        eventSource: null,
        scopes: ['alerts:read'], // missing events:ingest
      };

      const guard = requireApiKeyScope('events:ingest');
      guard(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = getNextError(next);
      expect(error?.statusCode).toBe(403);
      expect(error?.message).toContain("Insufficient API key scope permissions: 'events:ingest' required");
    });

    it('rejects with 401 Unauthorized when no apiKey exists on res.locals', () => {
      const { req, res, next } = createMockReqRes();

      const guard = requireApiKeyScope('events:ingest');
      guard(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const error = getNextError(next);
      expect(error?.statusCode).toBe(401);
    });
  });
});

import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import argon2 from 'argon2';
import { logger } from '../../config/logger.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../errors/app-error.js';

export interface AuthenticatedApiKeyContext {
  id: string;
  name: string;
  eventSourceId: string | null;
  eventSource: {
    id: string;
    name: string;
    status: string;
  } | null;
  scopes: string[];
}

// In-memory throttle for asynchronous last_used_at and last_used_ip updates (60 seconds)
const USAGE_UPDATE_THROTTLE_MS = 60_000;
const lastUsageUpdateMap = new Map<string, number>();

function recordApiKeyUsageThrottled(keyId: string, ip?: string): void {
  const now = Date.now();
  const lastUpdated = lastUsageUpdateMap.get(keyId) ?? 0;
  if (now - lastUpdated < USAGE_UPDATE_THROTTLE_MS) {
    return;
  }
  lastUsageUpdateMap.set(keyId, now);

  if (lastUsageUpdateMap.size > 10_000) {
    lastUsageUpdateMap.clear();
    lastUsageUpdateMap.set(keyId, now);
  }

  // Non-blocking fire-and-forget DB update with safe operational error logging;
  // swallows error to prevent background usage tracking failures from interrupting ingestion throughput.
  prisma.integration_api_keys
    .update({
      where: { id: keyId },
      data: {
        last_used_at: new Date(now),
        last_used_ip: ip ?? null,
      },
    })
    .catch((error: unknown) => {
      logger.warn(
        {
          event: 'API_KEY_USAGE_UPDATE_FAILED',
          keyId,
          err: error instanceof Error ? error.message : 'Unknown database error',
        },
        'Failed to record API key last_used_at in background',
      );
    });
}

function extractApiKeyToken(req: Request): string | null {
  const customHeader = req.headers['x-api-key'] ?? req.headers['x-securaai-ingest-key'];
  if (typeof customHeader === 'string' && customHeader.trim().length > 0) {
    return customHeader.trim();
  }

  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    const trimmed = authHeader.trim();
    if (trimmed.startsWith('Bearer ') || trimmed.startsWith('ApiKey ')) {
      return trimmed.slice(7).trim();
    }
    if (trimmed.startsWith('sec_live_')) {
      return trimmed;
    }
  }

  return null;
}

function extractKeyPrefix(token: string): string | null {
  // SecuraAI API Keys follow format: sec_live_ (9 chars) + 48 hex chars.
  // The prefix stored in the database is sec_live_ + first 10 hex chars (19 chars total).
  if (token.startsWith('sec_live_') && token.length >= 19) {
    return token.slice(0, 19);
  }
  return null;
}

async function verifySecretHash(storedHash: string, suppliedSecret: string): Promise<boolean> {
  // 1. Support Argon2id hash verification
  if (storedHash.startsWith('$argon2')) {
    try {
      return await argon2.verify(storedHash, suppliedSecret);
    } catch {
      return false;
    }
  }

  // 2. Support SHA-256 hash verification (64-character hex string) with timingSafeEqual against full token
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    try {
      const computed = createHash('sha256').update(suppliedSecret).digest('hex');
      return timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(storedHash, 'hex'),
      );
    } catch {
      return false;
    }
  }

  return false;
}

export const authenticateApiKey: RequestHandler = async (req, res, next) => {
  const token = extractApiKeyToken(req);
  if (!token) {
    next(new AppError(401, 'UNAUTHORIZED', 'Missing API key or ingestion token'));
    return;
  }

  // 1. Check intentional static environment token transition policy
  const configuredEnvToken =
    process.env['SECURAAI_INGEST_TOKEN'] ?? process.env['WAZUH_INGEST_TOKEN'];

  if (
    configuredEnvToken &&
    configuredEnvToken !== 'YOUR_SECURA_AI_INGEST_TOKEN' &&
    token === configuredEnvToken
  ) {
    res.locals.apiKey = {
      id: 'static-env-token',
      name: 'Environment Static Ingestion Token',
      eventSourceId: null,
      eventSource: null,
      // Strictly restrict static environment token ONLY to events:ingest scope
      scopes: ['events:ingest'],
    };
    next();
    return;
  }

  // 2. Parse token prefix for dynamic database API Key lookup
  const keyPrefix = extractKeyPrefix(token);
  if (!keyPrefix) {
    logger.warn({ event: 'API_KEY_AUTH_FAILED', reason: 'INVALID_FORMAT' }, 'Invalid API key format presented');
    next(new AppError(401, 'UNAUTHORIZED', 'Invalid or unauthorized API key'));
    return;
  }

  try {
    // Single consolidated database query loading the API key, associated event source, and authorized scopes
    const record = await prisma.integration_api_keys.findUnique({
      where: { key_prefix: keyPrefix },
      select: {
        id: true,
        name: true,
        key_prefix: true,
        secret_hash: true,
        status: true,
        expires_at: true,
        event_source_id: true,
        event_sources: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        api_key_scopes: {
          select: {
            scope_code: true,
          },
        },
      },
    });

    if (!record) {
      logger.warn({ event: 'API_KEY_AUTH_FAILED', reason: 'NOT_FOUND', keyPrefix }, 'API key prefix not found in database');
      next(new AppError(401, 'UNAUTHORIZED', 'Invalid or unauthorized API key'));
      return;
    }

    if (record.status !== 'ACTIVE') {
      logger.warn(
        { event: 'API_KEY_AUTH_FAILED', reason: record.status, keyId: record.id, keyPrefix },
        'API key rejected due to non-active status',
      );
      // Uniform 401 error message to prevent state enumeration
      next(new AppError(401, 'UNAUTHORIZED', 'Invalid or unauthorized API key'));
      return;
    }

    if (record.expires_at && record.expires_at.getTime() <= Date.now()) {
      logger.warn(
        { event: 'API_KEY_AUTH_FAILED', reason: 'EXPIRED', keyId: record.id, expiresAt: record.expires_at },
        'API key rejected due to expiration',
      );
      // Uniform 401 error message to prevent state enumeration
      next(new AppError(401, 'UNAUTHORIZED', 'Invalid or unauthorized API key'));
      return;
    }

    // Verify secret cryptographic hash against the full token
    const isValid = await verifySecretHash(record.secret_hash, token);
    if (!isValid) {
      logger.warn(
        { event: 'API_KEY_AUTH_FAILED', reason: 'INVALID_HASH', keyId: record.id, keyPrefix },
        'API key secret hash mismatch',
      );
      next(new AppError(401, 'UNAUTHORIZED', 'Invalid or unauthorized API key'));
      return;
    }

    // Verify associated event source status if linked
    if (record.event_sources && record.event_sources.status !== 'ACTIVE') {
      logger.warn(
        { event: 'API_KEY_AUTH_BLOCKED', reason: 'EVENT_SOURCE_INACTIVE', keyId: record.id, eventSourceId: record.event_source_id },
        'API key blocked because associated event source is inactive or disabled',
      );
      next(
        new AppError(
          403,
          'FORBIDDEN',
          'Associated event source is inactive or disabled',
        ),
      );
      return;
    }

    // Record usage asynchronously with controlled in-memory throttle (60s)
    recordApiKeyUsageThrottled(record.id, req.ip);

    // Attach verified API Key context to res.locals
    res.locals.apiKey = {
      id: record.id,
      name: record.name,
      eventSourceId: record.event_source_id ?? null,
      eventSource: record.event_sources ?? null,
      scopes: record.api_key_scopes.map((s) => s.scope_code),
    };

    next();
  } catch (error) {
    next(error);
  }
};

export function requireApiKeyScope(requiredScope: string): RequestHandler {
  return (_req, res, next) => {
    const apiKey = res.locals.apiKey as AuthenticatedApiKeyContext | undefined;
    if (!apiKey) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }

    if (!apiKey.scopes || !apiKey.scopes.includes(requiredScope)) {
      next(
        new AppError(
          403,
          'FORBIDDEN',
          `Insufficient API key scope permissions: '${requiredScope}' required`,
        ),
      );
      return;
    }

    next();
  };
}

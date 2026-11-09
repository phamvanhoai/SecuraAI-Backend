import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  getRequestContext,
  normalizeClientIp,
  requestContextMiddleware,
  requestContextStorage,
} from '../src/common/middleware/request-context.js';

describe('normalizeClientIp', () => {
  it('returns undefined when ip is undefined or empty', () => {
    expect(normalizeClientIp(undefined)).toBeUndefined();
    expect(normalizeClientIp('')).toBeUndefined();
  });

  it('normalizes IPv6 loopback to 127.0.0.1', () => {
    expect(normalizeClientIp('::1')).toBe('127.0.0.1');
    expect(normalizeClientIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('strips ::ffff: prefix from IPv4-mapped IPv6 addresses', () => {
    expect(normalizeClientIp('::ffff:192.168.1.50')).toBe('192.168.1.50');
    expect(normalizeClientIp('::ffff:14.225.210.12')).toBe('14.225.210.12');
  });

  it('preserves standard IPv4 and native IPv6 addresses unchanged', () => {
    expect(normalizeClientIp('192.168.1.10')).toBe('192.168.1.10');
    expect(normalizeClientIp('10.0.0.1')).toBe('10.0.0.1');
    expect(normalizeClientIp('2001:db8::1')).toBe('2001:db8::1');
  });
});

describe('requestContextMiddleware', () => {
  it('populates AsyncLocalStorage store with normalized IP, user agent, and correlation ID', () => {
    const headers: Record<string, string> = {
      'user-agent': 'Vitest-Agent/1.0',
      'x-request-id': 'req-corr-1234',
    };

    const req = {
      ip: '::1',
      headers,
      get(headerName: string) {
        return headers[headerName.toLowerCase()];
      },
    } as unknown as Request;

    const res = {
      getHeader: vi.fn(),
    } as unknown as Response;

    const next = vi.fn(() => {
      const store = getRequestContext();
      expect(store).toBeDefined();
      expect(store?.sourceIp).toBe('127.0.0.1');
      expect(store?.userAgent).toBe('Vitest-Agent/1.0');
      expect(store?.correlationId).toBe('req-corr-1234');
    });

    requestContextMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Outside the middleware lifecycle, store should be undefined
    expect(getRequestContext()).toBeUndefined();
  });

  it('runs custom contexts using requestContextStorage.run', () => {
    requestContextStorage.run(
      { sourceIp: '10.10.10.10', userAgent: 'CustomAgent', correlationId: 'custom-corr' },
      () => {
        const store = getRequestContext();
        expect(store?.sourceIp).toBe('10.10.10.10');
        expect(store?.userAgent).toBe('CustomAgent');
        expect(store?.correlationId).toBe('custom-corr');
      },
    );
  });
});


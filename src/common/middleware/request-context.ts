import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export type RequestContext = {
  sourceIp?: string;
  userAgent?: string;
  correlationId?: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Normalizes client IP addresses:
 * - IPv6 loopback '::1' and IPv4-mapped loopback '::ffff:127.0.0.1' -> '127.0.0.1'
 * - IPv4-mapped IPv6 '::ffff:x.x.x.x' -> 'x.x.x.x'
 */
export function normalizeClientIp(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }
  return ip;
}

/**
 * Express middleware that initializes an AsyncLocalStorage store with
 * the client's normalized IP, User-Agent, and correlation ID for the request lifecycle.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userAgent = req.get('user-agent');
  const sourceIp = normalizeClientIp(req.ip);
  const headerCorrelation = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const resCorrelation = res.getHeader('x-request-id');
  const correlationId =
    typeof headerCorrelation === 'string'
      ? headerCorrelation
      : typeof resCorrelation === 'string'
        ? resCorrelation
        : undefined;

  const context: RequestContext = {
    ...(sourceIp ? { sourceIp } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(correlationId ? { correlationId } : {}),
  };

  requestContextStorage.run(context, () => {
    next();
  });
}

/**
 * Retrieves the current request context from the active AsyncLocalStorage store.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}


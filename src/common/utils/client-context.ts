import type { Request } from 'express';

export interface ClientContext {
  sourceIp?: string | undefined;
  userAgent?: string | undefined;
}

export function extractClientContext(req: Request): ClientContext {
  const forwarded = req.headers['x-forwarded-for'];
  let sourceIp: string | undefined;

  if (typeof forwarded === 'string') {
    sourceIp = forwarded.split(',')[0]?.trim();
  } else if (Array.isArray(forwarded) && forwarded[0]) {
    sourceIp = forwarded[0].split(',')[0]?.trim();
  } else if (req.ip) {
    sourceIp = req.ip;
  }

  const rawUserAgent = req.headers['user-agent'];
  const userAgent = typeof rawUserAgent === 'string' ? rawUserAgent : undefined;

  return {
    sourceIp: sourceIp || undefined,
    userAgent,
  };
}

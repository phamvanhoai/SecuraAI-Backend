import dnsPromises from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { AppError } from '../errors/app-error.js';
import { env } from '../../config/env.js';

export type SsrOptions = {
  allowPrivate?: boolean | undefined;
  allowedCidrs?: string[] | undefined;
};

/**
 * Normalizes IPv4-mapped IPv6 addresses (e.g. `::ffff:192.168.1.1` -> `192.168.1.1`)
 * and trims whitespace.
 */
export function normalizeIp(ipAddress: string): string {
  let ip = ipAddress.trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  return ip.toLowerCase();
}

/**
 * Converts an IPv4 string into a 32-bit unsigned integer.
 */
function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return 0;
  }
  return (((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0)) >>> 0;
}

/**
 * Checks if an IPv4 address belongs to a given IPv4 CIDR range (e.g. `192.168.56.0/24` or `192.168.56.101`).
 */
export function isIpInIpv4Cidr(ip: string, cidr: string): boolean {
  const [rangeIp, prefixStr] = cidr.trim().split('/');
  if (!rangeIp || net.isIP(rangeIp) !== 4) return false;

  const prefix = prefixStr !== undefined ? Number.parseInt(prefixStr, 10) : 32;
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  if (prefix === 0) return true;

  const mask = prefix === 32 ? 0xffffffff : ((0xffffffff << (32 - prefix)) >>> 0);
  const ipNum = ipv4ToUint32(ip);
  const rangeNum = ipv4ToUint32(rangeIp);

  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Matches IPv4 or IPv6 against a CIDR or IP literal.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const normalizedIp = normalizeIp(ip);
  const trimmedCidr = cidr.trim();

  // IPv4 in IPv4 CIDR
  if (net.isIP(normalizedIp) === 4) {
    return isIpInIpv4Cidr(normalizedIp, trimmedCidr);
  }

  // Exact match for IPv6
  return normalizedIp === normalizeIp(trimmedCidr);
}

/**
 * Permanent deny list that CANNOT be overridden by allowPrivate or allowedCidrs.
 * Includes loopback, AWS/cloud link-local metadata (169.254.169.254), multicast, broadcast, and unspecified.
 */
export function isPermanentDeny(ipAddress: string): boolean {
  const ip = normalizeIp(ipAddress);
  const version = net.isIP(ip);

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [p0, p1] = parts;
    if (p0 === undefined || p1 === undefined) return true;

    // 0.0.0.0/8 (Current network)
    if (p0 === 0) return true;
    // 127.0.0.0/8 (Loopback)
    if (p0 === 127) return true;
    // 169.254.0.0/16 (Link-Local / Cloud Instance Metadata)
    if (p0 === 169 && p1 === 254) return true;
    // 224.0.0.0/4 (Multicast)
    if (p0 >= 224 && p0 <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (p0 >= 240) return true;
    // 255.255.255.255/32 (Broadcast)
    if (ip === '255.255.255.255') return true;

    return false;
  }

  if (version === 6) {
    // ::1 (Loopback)
    if (ip === '::1') return true;
    // :: (Unspecified)
    if (ip === '::') return true;
    // fe80::/10 (Link-Local Unicast)
    if (/^fe[89ab]/i.test(ip)) return true;
    // ff00::/8 (Multicast)
    if (ip.startsWith('ff')) return true;

    return false;
  }

  return true;
}

/**
 * Checks if an IP belongs to standard RFC 1918 / ULA private ranges.
 */
export function isPrivateRfc1918(ipAddress: string): boolean {
  const ip = normalizeIp(ipAddress);
  const version = net.isIP(ip);

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [p0, p1] = parts;
    if (p0 === undefined || p1 === undefined) return true;

    // 10.0.0.0/8
    if (p0 === 10) return true;
    // 172.16.0.0/12
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.168.0.0/16
    if (p0 === 192 && p1 === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (p0 === 192 && p1 === 0 && parts[2] === 0) return true;
    // 198.18.0.0/15 (Network benchmark tests)
    if (p0 === 198 && (p1 === 18 || p1 === 19)) return true;

    return false;
  }

  if (version === 6) {
    // fc00::/7 (Unique Local Address - ULA)
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;

    return false;
  }

  return true;
}

/**
 * Determines whether an IP is forbidden under the active security policy:
 * Rule hierarchy:
 * 1. DENY_ALWAYS (Loopback, Metadata, Multicast, Broadcast) -> Always blocked.
 * 2. ALLOWED_CIDRS -> Allowed if matched against explicit CIDR whitelist.
 * 3. ALLOW_PRIVATE -> Allowed if global private flag is enabled.
 * 4. Default: All RFC1918/ULA private ranges blocked; public routable IPs allowed.
 */
export function isForbiddenIp(ipAddress: string, options?: SsrOptions): boolean {
  const normalized = normalizeIp(ipAddress);
  if (!net.isIP(normalized)) return true;

  // 1. Permanent Deny
  if (isPermanentDeny(normalized)) {
    return true;
  }

  const allowedCidrs = options?.allowedCidrs ?? env.SSRF_ALLOWED_CIDRS;
  const allowPrivate = options?.allowPrivate ?? env.ALLOW_PRIVATE_NETWORK_INTEGRATIONS;

  // 2. Specific CIDR Allowlist
  if (allowedCidrs && allowedCidrs.length > 0) {
    for (const cidr of allowedCidrs) {
      if (isIpInCidr(normalized, cidr)) {
        return false;
      }
    }
  }

  // 3. Global Private Network Flag
  if (allowPrivate) {
    return false;
  }

  // 4. Default RFC 1918 Private Block
  return isPrivateRfc1918(normalized);
}

export type ValidatedUrlResult = {
  parsedUrl: URL;
  pinnedIp: string;
  port: number;
  protocol: string;
};

/**
 * Validates a user-supplied URL against SSRF and DNS rebinding risks.
 * Resolves DNS ONCE, validates all returned A/AAAA addresses, and returns the pinned IP.
 */
export async function validateExternalUrl(
  rawUrl: string,
  options?: SsrOptions,
): Promise<ValidatedUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(422, 'INVALID_URL', 'The provided URL is not a valid standard URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(
      422,
      'INVALID_PROTOCOL',
      `URL protocol "${parsed.protocol}" is not supported. Only http: and https: are allowed`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new AppError(422, 'INVALID_URL', 'URL must include a valid hostname');
  }

  const port = parsed.port
    ? Number.parseInt(parsed.port, 10)
    : parsed.protocol === 'https:'
      ? 443
      : 80;

  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new AppError(422, 'INVALID_PORT', 'URL port must be a valid number between 1 and 65535');
  }

  // If hostname is already an IP address literal
  if (net.isIP(hostname)) {
    if (isForbiddenIp(hostname, options)) {
      throw new AppError(
        422,
        'FORBIDDEN_IP_ADDRESS',
        `Connecting to restricted or private network address "${hostname}" is prohibited`,
      );
    }
    return {
      parsedUrl: parsed,
      pinnedIp: normalizeIp(hostname),
      port,
      protocol: parsed.protocol,
    };
  }

  // Resolve DNS A and AAAA records ONCE and inspect every answer
  let addresses: LookupAddress[];
  try {
    addresses = await dnsPromises.lookup(hostname, { all: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown DNS resolution error';
    throw new AppError(422, 'DNS_RESOLUTION_FAILED', `DNS resolution failed for host "${hostname}": ${message}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new AppError(422, 'DNS_RESOLUTION_FAILED', `No DNS records found for host "${hostname}"`);
  }

  // Validate ALL resolved addresses against SSRF policy
  for (const record of addresses) {
    if (isForbiddenIp(record.address, options)) {
      throw new AppError(
        422,
        'FORBIDDEN_IP_ADDRESS',
        `Connecting to "${hostname}" is prohibited because it resolved to prohibited address ${record.address}`,
      );
    }
  }

  const pinnedIp = normalizeIp(addresses[0]!.address);

  return {
    parsedUrl: parsed,
    pinnedIp,
    port,
    protocol: parsed.protocol,
  };
}

export type SafeHttpRequestOptions = {
  url: string;
  method?: string | undefined;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
  data?: unknown;
  timeoutMs?: number | undefined;
  rejectUnauthorized?: boolean | undefined;
  allowPrivate?: boolean | undefined;
  allowedCidrs?: string[] | undefined;
  maxContentLength?: number | undefined;
};

export type SafeHttpResponse = {
  statusCode: number;
  statusText: string;
  latencyMs: number;
  ok: boolean;
  /** Parsed response body (JSON) or raw string. Null when body is empty or unreadable. */
  body: unknown;
};

/**
 * Executes an HTTP request with socket-level DNS pinning, zero redirects, and resource capping.
 * Protects against SSRF, DNS rebinding, redirect bypasses, and slow-response exhaustion.
 */
export async function executeSafeHttpRequest(options: SafeHttpRequestOptions): Promise<SafeHttpResponse> {
  const { parsedUrl, pinnedIp } = await validateExternalUrl(options.url, {
    allowPrivate: options.allowPrivate,
    allowedCidrs: options.allowedCidrs,
  });

  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10000, 1000), 15000);
  const maxContentLength = options.maxContentLength ?? 2 * 1024 * 1024; // 2 MB safety cap
  const startTime = Date.now();

  // Custom lookup that resolves directly to the pre-validated PINNED IP
  const pinnedLookup = (
    _host: string,
    lookupOpts: LookupOptions | ((err: NodeJS.ErrnoException | null, address: string | LookupAddress[] | string, family?: number) => void),
    maybeCallback?: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[] | string, family?: number) => void,
  ) => {
    const cb = typeof lookupOpts === 'function' ? lookupOpts : maybeCallback;
    if (typeof cb !== 'function') return;

    // Check if the pinned IP is still safe before socket establishment
    if (isForbiddenIp(pinnedIp, { allowPrivate: options.allowPrivate, allowedCidrs: options.allowedCidrs })) {
      const err = new Error(`Socket connection rejected to forbidden IP: ${pinnedIp}`) as NodeJS.ErrnoException;
      err.code = 'ERR_SSRF_FORBIDDEN_IP';
      cb(err, '');
      return;
    }

    const family = net.isIP(pinnedIp);
    if (typeof lookupOpts === 'object' && lookupOpts !== null && lookupOpts.all) {
      cb(null, [{ address: pinnedIp, family }]);
    } else {
      cb(null, pinnedIp, family);
    }
  };

  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const rejectUnauthorized = options.rejectUnauthorized !== false;

  const agent = isHttps
    ? new https.Agent({
        lookup: pinnedLookup,
        keepAlive: false,
        rejectUnauthorized,
        checkServerIdentity: rejectUnauthorized ? undefined : () => undefined,
      })
    : new http.Agent({
        lookup: pinnedLookup,
        keepAlive: false,
      });

  return new Promise<SafeHttpResponse>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const safeResolve = (val: SafeHttpResponse) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(val);
    };

    const safeReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    };

    const req = transport.request(
      parsedUrl,
      {
        method: options.method ?? 'GET',
        headers: {
          'User-Agent': 'SecuraAI-Integration-Probe/1.0',
          Accept: 'application/json, text/plain, */*',
          ...options.headers,
        },
        agent,
      },
      (res) => {
        const latencyMs = Date.now() - startTime;
        const statusCode = res.statusCode ?? 500;
        const contentType = res.headers['content-type'] ?? '';

        const chunks: Buffer[] = [];
        let bytesRead = 0;
        let limitExceeded = false;

        res.on('data', (chunk: Buffer) => {
          bytesRead += chunk.length;
          if (bytesRead > maxContentLength) {
            limitExceeded = true;
            res.destroy();
          } else {
            chunks.push(chunk);
          }
        });

        res.on('end', () => {
          let body: unknown = null;
          if (!limitExceeded && chunks.length > 0) {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (contentType.includes('application/json')) {
              try {
                body = JSON.parse(raw) as unknown;
              } catch {
                body = raw;
              }
            } else {
              body = raw;
            }
          }
          safeResolve({
            statusCode,
            statusText: res.statusMessage ?? '',
            latencyMs,
            ok: statusCode >= 200 && statusCode < 300,
            body,
          });
        });

        res.on('error', (err) => {
          if (!limitExceeded) safeReject(err);
        });
      },
    );

    timer = setTimeout(() => {
      req.destroy(new Error(`Connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', (err) => {
      safeReject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

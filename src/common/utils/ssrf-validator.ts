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

  if (net.isIP(normalizedIp) === 4) {
    return isIpInIpv4Cidr(normalizedIp, trimmedCidr);
  }

  // IPv6 exact or prefix match
  const [rangeIp, prefixStr] = trimmedCidr.split('/');
  if (!rangeIp) return false;
  if (prefixStr === undefined) {
    return normalizedIp === rangeIp.toLowerCase();
  }
  return normalizedIp.startsWith(rangeIp.toLowerCase());
}

/**
 * Checks if an IP is in the PERMANENT FORBIDDEN category.
 * This category CANNOT be overridden by any allowlist or private network flag.
 * Includes: Loopback, Cloud Metadata (169.254.169.254), 0.0.0.0/8, Broadcast, Multicast.
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
    // 169.254.0.0/16 (Link-local / Cloud Metadata 169.254.169.254)
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
 * Evaluates whether an IP address is forbidden according to the strict priority policy:
 * Priority Order:
 * 1. DENY_ALWAYS (Loopback, Metadata, Multicast, 0.0.0.0/8, Broadcast) -> BLOCK (Always true)
 * 2. Matches explicit allowed CIDR (SSRF_ALLOWED_CIDRS) -> ALLOW (false)
 * 3. RFC1918 / Private -> ALLOW if allowPrivate=true, else BLOCK (true)
 * 4. Public IP -> ALLOW (false)
 */
export function isForbiddenIp(ipAddress: string, options?: SsrOptions): boolean {
  const ip = normalizeIp(ipAddress);

  // 1. Permanent Deny wins over everything
  if (isPermanentDeny(ip)) {
    return true;
  }

  const allowedCidrs = options?.allowedCidrs ?? env.parsedAllowedCidrs ?? [];
  const allowPrivate = options?.allowPrivate ?? env.ALLOW_PRIVATE_NETWORK_INTEGRATIONS ?? false;

  // 2. Explicit CIDR Allowlist
  if (allowedCidrs.some((cidr) => isIpInCidr(ip, cidr))) {
    return false;
  }

  // 3. RFC 1918 / Private network check
  if (isPrivateRfc1918(ip)) {
    return !allowPrivate;
  }

  // 4. Public IP
  return false;
}

export type ValidatedUrlResult = {
  parsedUrl: URL;
  pinnedIp: string;
  port: number;
  protocol: string;
};

/**
 * Validates a target URL string before connecting.
 * Checks protocol, parses hostname, resolves DNS once and verifies ALL resolved IPs.
 * Returns the parsed URL along with the pinned validated IP address.
 */
export async function validateExternalUrl(urlString: string, options?: SsrOptions): Promise<ValidatedUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new AppError(400, 'INVALID_URL', 'The provided URL format is invalid');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(400, 'INVALID_PROTOCOL', 'Only http and https protocols are supported');
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new AppError(400, 'INVALID_HOSTNAME', 'URL hostname cannot be empty');
  }

  const port = parsed.port ? Number.parseInt(parsed.port, 10) : parsed.protocol === 'https:' ? 443 : 80;
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new AppError(400, 'INVALID_PORT', 'URL port must be a valid number between 1 and 65535');
  }

  // If hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isForbiddenIp(hostname, options)) {
      throw new AppError(400, 'SSRF_REJECTED', 'Connecting to private or restricted network addresses is prohibited');
    }
    return {
      parsedUrl: parsed,
      pinnedIp: normalizeIp(hostname),
      port,
      protocol: parsed.protocol,
    };
  }

  // Check localhost variations
  if (hostname.toLowerCase() === 'localhost' || hostname.toLowerCase().endsWith('.localhost')) {
    throw new AppError(400, 'SSRF_REJECTED', 'Connecting to localhost destinations is prohibited');
  }

  // Resolve DNS ONCE for both IPv4 and IPv6
  let resolvedIps: LookupAddress[] = [];
  try {
    resolvedIps = await dnsPromises.lookup(hostname, { all: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown DNS error';
    throw new AppError(400, 'DNS_RESOLUTION_FAILED', `DNS resolution failed for host "${hostname}": ${message}`);
  }

  if (resolvedIps.length === 0) {
    throw new AppError(400, 'DNS_RESOLUTION_FAILED', `No IP address found for host "${hostname}"`);
  }

  // Anti-Rebinding & Mixed IP Defense: ALL returned addresses must be permitted.
  // If ANY address is prohibited, reject the entire hostname.
  for (const { address } of resolvedIps) {
    if (isForbiddenIp(address, options)) {
      throw new AppError(
        400,
        'SSRF_REJECTED',
        `Host "${hostname}" resolved to prohibited address ${address}`,
      );
    }
  }

  const firstValidIp = resolvedIps[0]?.address;
  if (!firstValidIp) {
    throw new AppError(400, 'DNS_RESOLUTION_FAILED', `Could not resolve valid IP for host "${hostname}"`);
  }

  return {
    parsedUrl: parsed,
    pinnedIp: normalizeIp(firstValidIp),
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
    lookupOpts: LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    // Check if the pinned IP is still safe before socket establishment
    if (isForbiddenIp(pinnedIp, { allowPrivate: options.allowPrivate, allowedCidrs: options.allowedCidrs })) {
      const err = new Error(`Socket connection rejected to forbidden IP: ${pinnedIp}`) as NodeJS.ErrnoException;
      err.code = 'ERR_SSRF_FORBIDDEN_IP';
      callback(err, '');
      return;
    }

    const family = net.isIP(pinnedIp);
    if (lookupOpts && lookupOpts.all) {
      callback(null, [{ address: pinnedIp, family }]);
    } else {
      callback(null, pinnedIp, family);
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
      })
    : new http.Agent({
        lookup: pinnedLookup,
        keepAlive: false,
      });

  return new Promise<SafeHttpResponse>((resolve, reject) => {
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
        timeout: timeoutMs,
      },
      (res) => {
        const latencyMs = Date.now() - startTime;
        const statusCode = res.statusCode ?? 500;
        const contentType = res.headers['content-type'] ?? '';

        // Zero Redirects Enforcement: Do NOT follow HTTP redirects (301, 302, 303, 307, 308)
        if (statusCode >= 300 && statusCode < 400) {
          res.resume(); // consume stream
          resolve({
            statusCode,
            statusText: res.statusMessage ?? 'Redirect Blocked',
            latencyMs,
            ok: false,
            body: {
              redirectBlocked: true,
              location: res.headers.location ?? null,
              message: 'HTTP redirects are strictly prohibited for integration endpoints',
            },
          });
          return;
        }

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
          resolve({
            statusCode,
            statusText: res.statusMessage ?? '',
            latencyMs,
            ok: statusCode >= 200 && statusCode < 300,
            body,
          });
        });

        res.on('error', (err) => {
          if (!limitExceeded) reject(err);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Connection timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

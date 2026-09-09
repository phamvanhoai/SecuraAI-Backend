import dnsPromises from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { AppError } from '@/common/errors/app-error.js';

/**
 * Checks whether an IPv4 or IPv6 address belongs to a private, loopback, link-local,
 * cloud metadata, or reserved range that should not be reached by server-side requests.
 */
export function isForbiddenIp(ipAddress: string): boolean {
  // Handle IPv6-mapped IPv4 addresses (::ffff:192.168.1.1)
  let ip = ipAddress;
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [p0, p1] = parts;
    if (p0 === undefined || p1 === undefined) return true;

    // 0.0.0.0/8 (Current network)
    if (p0 === 0) return true;
    // 10.0.0.0/8 (Private)
    if (p0 === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (p0 === 127) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud Metadata including 169.254.169.254)
    if (p0 === 169 && p1 === 254) return true;
    // 172.16.0.0/12 (Private)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (p0 === 192 && p1 === 0 && parts[2] === 0) return true;
    // 192.168.0.0/16 (Private)
    if (p0 === 192 && p1 === 168) return true;
    // 198.18.0.0/15 (Network benchmark tests)
    if (p0 === 198 && (p1 === 18 || p1 === 19)) return true;
    // 224.0.0.0/4 (Multicast)
    if (p0 >= 224 && p0 <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (p0 >= 240) return true;
    // 255.255.255.255/32 (Broadcast)
    if (ip === '255.255.255.255') return true;

    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    // ::1 (Loopback)
    if (normalized === '::1') return true;
    // :: (Unspecified)
    if (normalized === '::') return true;
    // fc00::/7 (Unique Local Address - ULA)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    // fe80::/10 (Link-Local Unicast)
    if (/^fe[89ab]/i.test(normalized)) return true;
    // ff00::/8 (Multicast)
    if (normalized.startsWith('ff')) return true;

    return false;
  }

  // Not a valid IP
  return true;
}

/**
 * Validates a target URL string before connecting.
 * Checks protocol, parses hostname, resolves DNS and verifies all resolved IPs.
 */
export async function validateExternalUrl(urlString: string): Promise<URL> {
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

  // Check if hostname is directly an IP literal
  if (net.isIP(hostname) && isForbiddenIp(hostname)) {
    throw new AppError(400, 'SSRF_REJECTED', 'Connecting to private or restricted network addresses is prohibited');
  }

  // Check localhost variations
  if (hostname.toLowerCase() === 'localhost' || hostname.toLowerCase().endsWith('.localhost')) {
    throw new AppError(400, 'SSRF_REJECTED', 'Connecting to localhost destinations is prohibited');
  }

  // Resolve all DNS records (both IPv4 and IPv6)
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

  for (const { address } of resolvedIps) {
    if (isForbiddenIp(address)) {
      throw new AppError(
        400,
        'SSRF_REJECTED',
        `Host "${hostname}" resolved to prohibited address ${address}`,
      );
    }
  }

  return parsed;
}

export type SafeHttpRequestOptions = {
  url: string;
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  timeoutMs?: number;
  body?: string;
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
 * Executes an HTTP request with socket-level DNS pinning and redirect disabling.
 * Protects against SSRF and DNS rebinding during connection establishment.
 */
export async function executeSafeHttpRequest(options: SafeHttpRequestOptions): Promise<SafeHttpResponse> {
  const parsedUrl = await validateExternalUrl(options.url);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 5000, 1000), 10000);
  const startTime = Date.now();

  // Custom lookup function that re-verifies every IP before socket creation
  const customLookup = (
    host: string,
    lookupOpts: LookupOptions,
    callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
  ) => {
    dnsPromises.lookup(host, { all: true })
      .then((addresses) => {
        for (const record of addresses) {
          if (isForbiddenIp(record.address)) {
            const err = new Error(`Socket connection rejected to forbidden IP: ${record.address}`) as NodeJS.ErrnoException;
            err.code = 'ERR_SSRF_FORBIDDEN_IP';
            callback(err, '');
            return;
          }
        }
        const first = addresses[0];
        if (!first) {
          const err = new Error(`No IP addresses found for host: ${host}`) as NodeJS.ErrnoException;
          err.code = 'ENOTFOUND';
          callback(err, '');
          return;
        }
        if (lookupOpts && lookupOpts.all) {
          callback(null, addresses);
        } else {
          callback(null, first.address, first.family);
        }
      })
      .catch((err: NodeJS.ErrnoException) => callback(err, ''));
  };

  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const agent = isHttps
    ? new https.Agent({ lookup: customLookup, keepAlive: false })
    : new http.Agent({ lookup: customLookup, keepAlive: false });

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
        const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MB safety cap

        const chunks: Buffer[] = [];
        let bytesRead = 0;
        let limitExceeded = false;

        res.on('data', (chunk: Buffer) => {
          bytesRead += chunk.length;
          if (bytesRead > MAX_BODY_BYTES) {
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

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import type {
  TestEventSourceConnectionInput,
  TestEventSourceConnectionResponseDto,
} from '../dto/test-event-source-connection.dto.js';

type HttpResponse = {
  statusCode: number;
  statusText: string;
  body: unknown;
  rawText: string;
};

function formatEndpointUrl(endpoint: string): URL {
  const trimmed = endpoint.trim();
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return new URL(withProtocol);
}

function requestHttp(
  url: URL,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    rejectUnauthorized?: boolean;
    timeoutMs: number;
  },
): Promise<HttpResponse> {
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  const agent = isHttps
    ? new https.Agent({
        rejectUnauthorized: options.rejectUnauthorized !== false,
        keepAlive: false,
      })
    : new http.Agent({
        keepAlive: false,
      });

  return new Promise<HttpResponse>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: options.method,
        headers: {
          'User-Agent': 'SecuraAI-Wazuh-Tester/1.0',
          Accept: 'application/json, text/plain, */*',
          ...options.headers,
        },
        agent,
        timeout: options.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        const maxBytes = 2 * 1024 * 1024; // 2MB

        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes <= maxBytes) {
            chunks.push(chunk);
          }
        });

        res.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf-8');
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(rawText);
          } catch {
            parsed = rawText;
          }

          resolve({
            statusCode: res.statusCode ?? 500,
            statusText: res.statusMessage ?? '',
            body: parsed,
            rawText,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      const err = new Error(`Connection timed out after ${options.timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
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

function extractJwt(body: unknown, rawText: string): string {
  if (typeof body === 'object' && body !== null) {
    const bodyObj = body as Record<string, unknown>;
    const dataObj = bodyObj.data as Record<string, unknown> | undefined;
    if (typeof dataObj?.token === 'string') return dataObj.token.trim();
    if (typeof bodyObj.token === 'string') return bodyObj.token.trim();
    if (typeof bodyObj.jwt === 'string') return bodyObj.jwt.trim();
  }
  return rawText.trim().replace(/^"|"$/g, '');
}

export const wazuhConnectionTester = {
  async testConnection(
    input: TestEventSourceConnectionInput,
  ): Promise<TestEventSourceConnectionResponseDto> {
    const startTime = Date.now();
    const verifySsl = input.verifySsl !== false;
    const timeoutMs = input.timeoutMs ?? 5000;
    const username = input.username?.trim() || 'wazuh';
    const password = input.password || 'wazuh';

    let parsedUrl: URL;
    try {
      parsedUrl = formatEndpointUrl(input.endpoint);
    } catch {
      return {
        connected: false,
        statusCode: null,
        latencyMs: 0,
        message: `Invalid endpoint URL format: "${input.endpoint}"`,
        provider: 'wazuh',
        details: null,
        verifySslWarning: !verifySsl,
      };
    }

    const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/+$/, '')}`;

    // Step 1: Authenticate with HTTP Basic Auth to get JWT
    const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
    let authRes: HttpResponse;

    try {
      const authUrl = new URL(`${baseUrl}/security/user/authenticate?raw=true`);
      authRes = await requestHttp(authUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
        rejectUnauthorized: verifySsl,
        timeoutMs,
      });
    } catch (err: unknown) {
      const latency = Date.now() - startTime;
      const errObj = err as NodeJS.ErrnoException;
      let msg = errObj.message || 'Connection failed';

      if (
        errObj.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        errObj.code === 'CERT_HAS_EXPIRED' ||
        errObj.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
        errObj.code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
      ) {
        msg = `SSL Certificate Verification Error (${errObj.code}). If using self-signed certificates in dev/staging, disable SSL verification.`;
      } else if (errObj.code === 'ECONNREFUSED') {
        msg = `Connection refused by server at ${parsedUrl.host}. Ensure Wazuh API manager is running and port is open.`;
      } else if (errObj.code === 'ENOTFOUND') {
        msg = `Host not found: ${parsedUrl.hostname}. Check DNS or IP configuration.`;
      }

      return {
        connected: false,
        statusCode: null,
        latencyMs: latency,
        message: msg,
        provider: 'wazuh',
        details: null,
        verifySslWarning: !verifySsl,
      };
    }

    if (authRes.statusCode === 401 || authRes.statusCode === 403) {
      return {
        connected: false,
        statusCode: authRes.statusCode,
        latencyMs: Date.now() - startTime,
        message: 'Authentication failed: Invalid Wazuh username or password',
        provider: 'wazuh',
        details: null,
        verifySslWarning: !verifySsl,
      };
    }

    if (authRes.statusCode >= 400) {
      return {
        connected: false,
        statusCode: authRes.statusCode,
        latencyMs: Date.now() - startTime,
        message: `Wazuh authentication endpoint returned HTTP ${authRes.statusCode} (${authRes.statusText})`,
        provider: 'wazuh',
        details: null,
        verifySslWarning: !verifySsl,
      };
    }

    const jwtToken = extractJwt(authRes.body, authRes.rawText);
    if (!jwtToken || jwtToken.length < 8) {
      return {
        connected: false,
        statusCode: authRes.statusCode,
        latencyMs: Date.now() - startTime,
        message: 'Wazuh API responded but did not return a valid authentication token',
        provider: 'wazuh',
        details: null,
        verifySslWarning: !verifySsl,
      };
    }

    // Step 2: Query API Root with Bearer JWT
    let rootRes: HttpResponse;
    try {
      const rootUrl = new URL(`${baseUrl}/`);
      rootRes = await requestHttp(rootUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        rejectUnauthorized: verifySsl,
        timeoutMs,
      });
    } catch (err: unknown) {
      const latency = Date.now() - startTime;
      const errObj = err as Error;
      return {
        connected: false,
        statusCode: null,
        latencyMs: latency,
        message: `Authenticated with Wazuh but failed to query root endpoint: ${errObj.message}`,
        provider: 'wazuh',
        details: null,
        verifySslWarning: !verifySsl,
      };
    }

    const totalLatency = Date.now() - startTime;

    if (rootRes.statusCode >= 400) {
      return {
        connected: false,
        statusCode: rootRes.statusCode,
        latencyMs: totalLatency,
        message: `Wazuh API root returned HTTP ${rootRes.statusCode} (${rootRes.statusText})`,
        provider: 'wazuh',
        details: null,
        verifySslWarning: !verifySsl,
      };
    }

    let title: string | null = 'Wazuh REST API';
    let apiVersion: string | null = null;
    let hostname: string | null = null;

    if (typeof rootRes.body === 'object' && rootRes.body !== null) {
      const bodyObj = rootRes.body as Record<string, unknown>;
      const dataObj = (bodyObj.data as Record<string, unknown> | undefined) ?? bodyObj;
      title = typeof dataObj.title === 'string' ? dataObj.title : title;
      apiVersion =
        typeof dataObj.api_version === 'string'
          ? dataObj.api_version
          : typeof dataObj.apiVersion === 'string'
            ? dataObj.apiVersion
            : null;
      hostname = typeof dataObj.hostname === 'string' ? dataObj.hostname : null;
    }

    return {
      connected: true,
      statusCode: rootRes.statusCode,
      latencyMs: totalLatency,
      message: 'Wazuh API connected and authenticated successfully',
      provider: 'wazuh',
      details: {
        title,
        apiVersion,
        hostname,
      },
      verifySslWarning: !verifySsl,
    };
  },
};

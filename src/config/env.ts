import 'dotenv/config';
import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().max(30).default(7),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanString.default(false),
  SWAGGER_ENABLED: booleanString.default(true),
  FILE_STORAGE_DIR: z.string().trim().min(1).default('uploads'),
  APP_NAME: z.string().trim().min(1).default('SecuraAI'),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  PASSWORD_RESET_URL: z.string().url().default('http://localhost:5173/reset-password'),
  ENCRYPTION_KEY: z.string().min(16).optional(),
  ALLOW_PRIVATE_NETWORK_INTEGRATIONS: booleanString.default(false),
  SSRF_ALLOWED_CIDRS: z.string().default(''),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment configuration', z.treeifyError(result.error));
  process.exit(1);
}

// Validate SSRF_ALLOWED_CIDRS format and reject dangerous permanent deny ranges at startup
const rawCidrs = result.data.SSRF_ALLOWED_CIDRS.split(',').map((c) => c.trim()).filter(Boolean);
const PERMANENT_FORBIDDEN_PATTERNS = [
  /^127\./,
  /^169\.254\./,
  /^0\.0\.0\.0/,
  /^224\./,
  /^240\./,
  /^255\.255\.255\.255/,
  /^::1$/,
  /^::$/,
  /^fe80:/i,
  /^ff00:/i,
];

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
const IPV6_CIDR_REGEX = /^[0-9a-fA-F:]+(\/([0-9]|[1-9][0-9]|1[0-1][0-9]|12[0-8]))?$/;

for (const cidr of rawCidrs) {
  if (!CIDR_REGEX.test(cidr) && !IPV6_CIDR_REGEX.test(cidr)) {
    console.error(`Invalid SSRF_ALLOWED_CIDRS entry: "${cidr}". Expected valid IPv4/IPv6 CIDR or IP.`);
    process.exit(1);
  }
  const ipPart = cidr.split('/')[0] ?? '';
  if (PERMANENT_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(ipPart))) {
    console.error(`Startup error: SSRF_ALLOWED_CIDRS contains permanently forbidden range: "${cidr}".`);
    process.exit(1);
  }
}

export const env = {
  ...result.data,
  corsOrigins: result.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
  parsedAllowedCidrs: rawCidrs,
};

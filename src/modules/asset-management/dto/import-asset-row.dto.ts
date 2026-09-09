import { z } from 'zod';
import { assetCriticalities } from './list-assets-query.dto.js';

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === '' ? undefined : value));

const metadata = z.string().transform((value, context) => {
  if (value.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    const result = z.record(z.string(), z.json()).safeParse(parsed);
    if (!result.success || Buffer.byteLength(JSON.stringify(result.data), 'utf8') > 20_000) {
      context.addIssue({ code: 'custom', message: 'Metadata must be a JSON object up to 20 KB' });
      return z.NEVER;
    }
    return result.data;
  } catch {
    context.addIssue({ code: 'custom', message: 'Metadata must be valid JSON' });
    return z.NEVER;
  }
});

export const importAssetRowSchema = z.object({
  assetCode: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'Invalid asset code format')),
  name: z.string().trim().min(1).max(150),
  assetType: z.string().trim().min(1).max(50),
  description: optionalText(10_000),
  departmentCode: optionalText(50),
  ownerEmployeeCode: optionalText(50),
  criticality: z
    .string()
    .trim()
    .transform((value) => (value === '' ? 'medium' : value.toLowerCase()))
    .pipe(z.enum(assetCriticalities)),
  hostname: optionalText(255),
  ipAddress: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.union([z.ipv4(), z.ipv6()]).optional()),
  location: optionalText(255),
  metadata,
});

export type ImportAssetRow = z.infer<typeof importAssetRowSchema>;

export const assetImportJobParamsSchema = z.object({ importJobId: z.uuid() });

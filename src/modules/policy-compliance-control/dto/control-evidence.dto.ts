import { z } from 'zod';

// A reference is never fetched by the backend. Credentials embedded in URLs are not accepted.
export const evidenceDocumentUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) =>
      !Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127),
    'Document URL cannot contain whitespace or control characters',
  )
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Use an HTTPS document URL without embedded credentials')
  .transform((value) => new URL(value).href);
export const addControlEvidenceSchema = z
  .object({
    requestId: z.uuid(),
    name: z.string().trim().min(3).max(255),
    source: z.string().trim().min(3).max(255),
    description: z.string().trim().min(10).max(5000),
    documentUrl: evidenceDocumentUrlSchema,
    collectedAt: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    (value) => !value.validUntil || new Date(value.validUntil) > new Date(value.collectedAt),
    {
      path: ['validUntil'],
      message: 'Validity must end after collection',
    },
  );
export const linkControlEvidenceSchema = z
  .object({ evidenceId: z.uuid(), reason: z.string().trim().min(10).max(2000) })
  .strict();
export const listControlEvidenceSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    q: z.string().trim().max(100).default(''),
    view: z.enum(['linked', 'available']).default('linked'),
  })
  .strict();
export type AddControlEvidence = z.infer<typeof addControlEvidenceSchema>;
export type LinkControlEvidence = z.infer<typeof linkControlEvidenceSchema>;
export type ListControlEvidence = z.infer<typeof listControlEvidenceSchema>;

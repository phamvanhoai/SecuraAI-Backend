import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  prepareEvidenceFile,
} from '../src/modules/policy-compliance-control/control-evidence.storage.js';

function upload(name: string, type: string, buffer: Buffer): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: type,
    size: buffer.length,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}

describe('Control Evidence file storage', () => {
  it('accepts an approved PDF, assigns a private key and SHA-256', async () => {
    const id = randomUUID();
    const result = await prepareEvidenceFile(
      upload('MFA report.pdf', 'application/pdf', Buffer.from('%PDF-1.7\nDemo evidence')),
      id,
    );
    expect(result).toMatchObject({
      storageKey: `control-evidence/${id}.pdf`,
      originalFileName: 'MFA report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 22,
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects forbidden types, mismatched MIME and fake content', async () => {
    await expect(
      prepareEvidenceFile(upload('run.exe', 'application/octet-stream', Buffer.from('MZ')), randomUUID()),
    ).rejects.toMatchObject({ code: 'EVIDENCE_FILE_TYPE_NOT_ALLOWED' });
    await expect(
      prepareEvidenceFile(upload('report.pdf', 'text/plain', Buffer.from('%PDF-1.7')), randomUUID()),
    ).rejects.toMatchObject({ code: 'EVIDENCE_MIME_MISMATCH' });
    await expect(
      prepareEvidenceFile(upload('report.pdf', 'application/pdf', Buffer.from('not a pdf')), randomUUID()),
    ).rejects.toMatchObject({ code: 'EVIDENCE_FILE_CONTENT_MISMATCH' });
  });
});

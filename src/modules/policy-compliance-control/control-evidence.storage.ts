import { createHash } from 'node:crypto';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { AppError } from '../../common/errors/app-error.js';

const root = path.resolve(process.cwd(), 'uploads', 'control-evidence');
const allowed = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;
type Extension = keyof typeof allowed;

function extension(name: string): Extension {
  const value = path.extname(path.basename(name)).slice(1).toLowerCase();
  if (!(value in allowed))
    throw new AppError(
      422,
      'EVIDENCE_FILE_TYPE_NOT_ALLOWED',
      'Only PDF, PNG, JPG/JPEG, TXT, CSV and XLSX files are allowed',
    );
  return value as Extension;
}
function starts(buffer: Buffer, bytes: readonly number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}
function validText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  return Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
}
async function verifyContents(buffer: Buffer, ext: Extension): Promise<void> {
  const valid =
    ext === 'pdf'
      ? buffer.subarray(0, 5).toString('ascii') === '%PDF-'
      : ext === 'png'
        ? starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : ext === 'jpg' || ext === 'jpeg'
          ? starts(buffer, [0xff, 0xd8, 0xff])
          : ext === 'txt' || ext === 'csv'
            ? validText(buffer)
            : starts(buffer, [0x50, 0x4b, 0x03, 0x04]);
  if (!valid)
    throw new AppError(
      422,
      'EVIDENCE_FILE_CONTENT_MISMATCH',
      'The file contents do not match the selected file type',
    );
  if (ext === 'xlsx') {
    try {
      const workbook = new ExcelJS.Workbook();
      const workbookBuffer = new ArrayBuffer(buffer.length);
      new Uint8Array(workbookBuffer).set(buffer);
      await workbook.xlsx.load(workbookBuffer);
    } catch {
      throw new AppError(422, 'INVALID_XLSX_EVIDENCE', 'The XLSX workbook cannot be read');
    }
  }
}
function safeOriginalName(value: string): string {
  const name = Array.from(path.basename(value))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .trim();
  if (!name || name.length > 255)
    throw new AppError(422, 'INVALID_EVIDENCE_FILE_NAME', 'The evidence file name is invalid');
  return name;
}

export async function prepareEvidenceFile(file: Express.Multer.File, id: string) {
  if (!file.buffer.length)
    throw new AppError(422, 'EMPTY_EVIDENCE_FILE', 'The evidence file cannot be empty');
  const ext = extension(file.originalname);
  if (file.mimetype !== allowed[ext])
    throw new AppError(
      422,
      'EVIDENCE_MIME_MISMATCH',
      'The reported file type does not match the file extension',
    );
  await verifyContents(file.buffer, ext);
  const originalFileName = safeOriginalName(file.originalname);
  const storageKey = `control-evidence/${id}.${ext === 'jpeg' ? 'jpg' : ext}`;
  return {
    buffer: file.buffer,
    storageKey,
    originalFileName,
    mimeType: allowed[ext],
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
  };
}

export async function storeEvidenceFile(storageKey: string, buffer: Buffer): Promise<boolean> {
  await mkdir(root, { recursive: true });
  const target = resolveEvidencePath(storageKey);
  try {
    const handle = await open(target, 'wx');
    try {
      await handle.writeFile(buffer);
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}
export async function removeEvidenceFile(storageKey: string): Promise<void> {
  await unlink(resolveEvidencePath(storageKey)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
export function resolveEvidencePath(storageKey: string): string {
  const relative = storageKey.replace(/^control-evidence\//, '');
  const target = path.resolve(root, relative);
  if (path.dirname(target) !== root)
    throw new AppError(500, 'INVALID_EVIDENCE_STORAGE_KEY', 'Evidence storage is invalid');
  return target;
}
export async function readVerifiedEvidenceFile(storageKey: string, sha256: string): Promise<Buffer> {
  const buffer = await readFile(resolveEvidencePath(storageKey)).catch(() => {
    throw new AppError(404, 'EVIDENCE_FILE_NOT_FOUND', 'The evidence file is unavailable');
  });
  if (createHash('sha256').update(buffer).digest('hex') !== sha256)
    throw new AppError(409, 'EVIDENCE_INTEGRITY_FAILED', 'The evidence file integrity check failed');
  return buffer;
}

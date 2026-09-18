import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';

const root = path.resolve(env.FILE_STORAGE_DIR, 'training-materials');
const allowed: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};
export type CourseUpload = {
  key: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};
const parser = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      mkdir(root, { recursive: true }).then(
        () => callback(null, root),
        () => callback(new Error('Storage unavailable'), root),
      );
    },
    filename: (_req, _file, callback) => callback(null, randomUUID()),
  }),
  limits: { files: 10, fields: 1, fieldSize: 1024 * 1024, fileSize: 20 * 1024 * 1024, parts: 11 },
  fileFilter: (_req, file, callback) => {
    if (
      !/^[0-9a-f-]{36}$/i.test(file.fieldname) ||
      file.originalname.length > 255 ||
      allowed[path.extname(file.originalname).toLowerCase()] !== file.mimetype
    )
      return callback(
        new AppError(
          422,
          'INVALID_TRAINING_FILE',
          'Upload PDF, MP4 or WebM with a matching content type',
        ),
      );
    callback(null, true);
  },
}).any();

export const parseCourseUpload: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  if (process.env.VERCEL)
    return next(
      new AppError(
        503,
        'LOCAL_STORAGE_UNAVAILABLE',
        'Local file uploads require a persistent server storage directory',
      ),
    );
  parser(req, res, (error: unknown) => {
    if (!error) return next();
    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    next(
      new AppError(
        tooLarge ? 413 : 422,
        'INVALID_TRAINING_UPLOAD',
        tooLarge ? 'Each training file must be 20 MB or smaller' : 'Invalid training upload',
      ),
    );
  });
};

export async function cleanupCourseUploads(files: readonly Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map((file) => rm(path.join(root, file.filename), { force: true })));
}

export async function inspectCourseUploads(
  files: readonly Express.Multer.File[],
): Promise<CourseUpload[]> {
  const results: CourseUpload[] = [];
  for (const file of files) {
    const handle = await open(path.join(root, file.filename), 'r');
    try {
      const header = Buffer.alloc(16);
      await handle.read(header, 0, 16, 0);
      const valid =
        file.mimetype === 'application/pdf'
          ? header.subarray(0, 5).toString() === '%PDF-'
          : file.mimetype === 'video/mp4'
            ? header.subarray(4, 8).toString() === 'ftyp'
            : header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      const size = (await stat(path.join(root, file.filename))).size;
      if (!valid || size === 0)
        throw new AppError(
          422,
          'INVALID_TRAINING_CONTENT',
          'The uploaded file content does not match its declared type',
        );
      const hash = createHash('sha256');
      for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) {
        const bytes: unknown = chunk;
        if (!Buffer.isBuffer(bytes))
          throw new AppError(422, 'INVALID_TRAINING_CONTENT', 'Could not read uploaded content');
        hash.update(bytes);
      }
      results.push({
        key: file.fieldname,
        storageKey: path.posix.join('training-materials', file.filename),
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: size,
        checksum: hash.digest('hex'),
      });
    } finally {
      await handle.close();
    }
  }
  return results;
}

import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error.js';

const allowedTypes: Readonly<Record<string, ReadonlySet<string>>> = {
  '.pdf': new Set(['application/pdf']),
  '.png': new Set(['image/png']),
  '.jpg': new Set(['image/jpeg']),
  '.jpeg': new Set(['image/jpeg']),
  '.txt': new Set(['text/plain']),
  '.log': new Set(['text/plain', 'application/octet-stream']),
  '.csv': new Set(['text/csv', 'text/plain', 'application/vnd.ms-excel']),
  '.json': new Set(['application/json', 'text/plain']),
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 1 },
  fileFilter: (_request, file, callback) => {
    const mimeTypes = allowedTypes[path.extname(file.originalname).toLowerCase()];
    if (mimeTypes?.has(file.mimetype.toLowerCase())) return callback(null, true);
    return callback(
      new AppError(
        422,
        'INVALID_EVIDENCE_FILE',
        'The file extension does not match a supported evidence content type',
      ),
    );
  },
}).single('file');

export const uploadIncidentEvidenceFile: RequestHandler = (request, response, next) =>
  upload(request, response, (error: unknown) => {
    if (!error && request.file) return next();
    if (!error)
      return next(
        new AppError(422, 'EVIDENCE_FILE_REQUIRED', 'An evidence or log file is required'),
      );
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
      return next(
        new AppError(413, 'EVIDENCE_FILE_TOO_LARGE', 'Incident evidence may not exceed 20 MB'),
      );
    return next(
      new AppError(422, 'INVALID_EVIDENCE_FILE', 'The evidence file type is not supported'),
    );
  });

import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error.js';

const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 }, fileFilter: (_req, file, callback) => callback(null, allowed.has(file.mimetype)) }).single('file');
export const uploadComplianceEvidenceFile: RequestHandler = (req, res, next) => upload(req, res, (error: unknown) => {
  if (!error && req.file) return next();
  if (!error) return next(new AppError(422, 'EVIDENCE_FILE_REQUIRED', 'An evidence file is required'));
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'EVIDENCE_FILE_TOO_LARGE', 'Evidence files may not exceed 10 MB'));
  return next(new AppError(422, 'INVALID_EVIDENCE_FILE', 'The evidence upload is invalid or uses an unsupported file type'));
});

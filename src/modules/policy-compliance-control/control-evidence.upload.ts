import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../common/errors/app-error.js';

export const CONTROL_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONTROL_EVIDENCE_MAX_BYTES, files: 1, fields: 6 },
}).single('file');

export const uploadControlEvidenceFile: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(413, 'EVIDENCE_FILE_TOO_LARGE', 'Evidence files may not exceed 10 MB'),
      );
    }
    return next(
      new AppError(422, 'INVALID_EVIDENCE_UPLOAD', 'The evidence upload is invalid'),
    );
  });
};

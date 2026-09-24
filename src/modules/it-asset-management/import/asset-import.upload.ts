import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError } from '../../../common/errors/app-error.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
}).single('file');

export const uploadAssetWorkbook: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(413, 'IMPORT_FILE_TOO_LARGE', 'Excel files may not exceed 5 MB'));
    }
    return next(new AppError(422, 'INVALID_IMPORT_FILE', 'The Excel upload is invalid'));
  });
};

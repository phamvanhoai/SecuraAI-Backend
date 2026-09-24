import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { myCertificatesQuerySchema } from './dto/my-certificates.dto.js';
import { myCertificatesService } from './my-certificates.service.js';

export const listMyCertificates: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({
    success: true,
    data: await myCertificatesService.list(myCertificatesQuerySchema.parse(req.query), req.auth),
  });
};

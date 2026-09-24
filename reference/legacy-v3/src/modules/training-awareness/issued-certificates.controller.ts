import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { issuedCertificatesQuerySchema } from './dto/issued-certificates.dto.js';
import { issuedCertificatesService } from './issued-certificates.service.js';

export const listIssuedCertificates: RequestHandler = async (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.json({
    success: true,
    data: await issuedCertificatesService.list(
      issuedCertificatesQuerySchema.parse(req.query),
      req.auth,
    ),
  });
};

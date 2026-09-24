import { Router } from 'express';
import { AppError } from '../common/errors/app-error.js';
import { legacyV1RouteContracts } from './legacy-v1-route-contracts.js';

export const pendingV2Router = Router();

for (const route of legacyV1RouteContracts) {
  const expressPath = route.path.replace(/\{([^}]+)\}/g, ':$1');
  pendingV2Router[route.method](expressPath, (_req, _res, next) => {
    next(new AppError(501, 'ENDPOINT_NOT_IMPLEMENTED', 'This endpoint is pending migration to the V2 database'));
  });
}

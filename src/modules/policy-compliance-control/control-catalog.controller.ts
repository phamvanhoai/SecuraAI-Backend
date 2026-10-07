import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { controlCatalogService } from './control-catalog.service.js';
import {
  controlParamsSchema,
  controlOwnerQuerySchema,
  createControlSchema,
  editControlSchema,
} from './dto/manage-control.dto.js';
function actorId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const getCatalogControl: RequestHandler = async (req, res) => {
  const data = await controlCatalogService.get(
    actorId(res.locals.authenticatedUserId),
    controlParamsSchema.parse(req.params).controlId,
  );
  res.json({ success: true, data });
};
export const listControlOwners: RequestHandler = async (req, res) => {
  const data = await controlCatalogService.owners(
    actorId(res.locals.authenticatedUserId),
    controlOwnerQuerySchema.parse(req.query).q,
  );
  res.json({ success: true, data });
};
export const createCatalogControl: RequestHandler = async (req, res) => {
  const data = await controlCatalogService.create(
    actorId(res.locals.authenticatedUserId),
    createControlSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const editCatalogControl: RequestHandler = async (req, res) => {
  const data = await controlCatalogService.edit(
    actorId(res.locals.authenticatedUserId),
    controlParamsSchema.parse(req.params).controlId,
    editControlSchema.parse(req.body),
  );
  res.json({ success: true, data });
};

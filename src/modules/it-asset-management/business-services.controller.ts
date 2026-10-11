import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { businessServicesService } from './business-services.service.js';
import { updateBusinessServiceSchema } from './dto/update-business-service.dto.js';
import { deactivateBusinessServiceSchema } from './dto/deactivate-business-service.dto.js';
import {
  createBusinessServiceSchema,
  businessServiceOwnerQuerySchema,
} from './dto/create-business-service.dto.js';
import {
  businessServiceParamsSchema,
  listBusinessServicesQuerySchema,
  servicePageQuerySchema,
} from './dto/list-business-services.dto.js';

function userId(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
}
export const checkBusinessServiceDeactivation: RequestHandler = async (req, res) => {
  const { serviceId } = businessServiceParamsSchema.parse(req.params);
  const data = await businessServicesService.deactivationCheck(
    userId(res.locals.authenticatedUserId),
    serviceId,
  );
  res.json({ success: true, data });
};
export const deactivateBusinessService: RequestHandler = async (req, res) => {
  const { serviceId } = businessServiceParamsSchema.parse(req.params);
  const data = await businessServicesService.deactivate(
    userId(res.locals.authenticatedUserId),
    serviceId,
    deactivateBusinessServiceSchema.parse(req.body),
  );
  res.json({ success: true, data });
};
export const createBusinessService: RequestHandler = async (req, res) => {
  const data = await businessServicesService.create(
    userId(res.locals.authenticatedUserId),
    createBusinessServiceSchema.parse(req.body),
  );
  res.status(201).json({ success: true, data });
};
export const updateBusinessService: RequestHandler = async (req, res) => {
  const { serviceId } = businessServiceParamsSchema.parse(req.params);
  const data = await businessServicesService.update(
    userId(res.locals.authenticatedUserId),
    serviceId,
    updateBusinessServiceSchema.parse(req.body),
  );
  res.json({ success: true, data });
};
export const getBusinessServiceOwners: RequestHandler = async (req, res) => {
  const query = businessServiceOwnerQuerySchema.parse(req.query);
  const data = await businessServicesService.ownerOptions(
    userId(res.locals.authenticatedUserId),
    query.q,
  );
  res.json({ success: true, data });
};
export const listBusinessServices: RequestHandler = async (req, res) => {
  const data = await businessServicesService.list(
    userId(res.locals.authenticatedUserId),
    listBusinessServicesQuerySchema.parse(req.query),
  );
  res.json({ success: true, data });
};
export const getBusinessService: RequestHandler = async (req, res) => {
  const { serviceId } = businessServiceParamsSchema.parse(req.params);
  const data = await businessServicesService.get(userId(res.locals.authenticatedUserId), serviceId);
  res.json({ success: true, data });
};
export const listBusinessServiceAssets: RequestHandler = async (req, res) => {
  const { serviceId } = businessServiceParamsSchema.parse(req.params);
  const data = await businessServicesService.listAssets(
    userId(res.locals.authenticatedUserId),
    serviceId,
    servicePageQuerySchema.parse(req.query),
  );
  res.json({ success: true, data });
};

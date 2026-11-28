import type { RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import {
  assessControlEffectivenessBodySchema,
  controlEffectivenessParamsSchema,
  listControlEffectivenessQuerySchema,
} from './dto/assess-control-effectiveness.dto.js';
import { controlEffectivenessService } from './control-effectiveness.service.js';
// Read the user ID set by authentication middleware, not an ID from the form.
const userId = (value: unknown) => {
  // Stop if there is no valid authenticated user ID.
  if (typeof value !== 'string') throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return value;
};
// Load the Control effectiveness list within the user access scope.
export const listControlEffectiveness: RequestHandler = async (req, res) => {
  // Let the service check access and load the list.
  const data = await controlEffectivenessService.list(
    // Use the signed-in user as the person performing this action.
    userId(res.locals.authenticatedUserId),
    // Validate search, filter and pagination values from the URL query.
    listControlEffectivenessQuerySchema.parse(req.query),
  );
  // Return the list with HTTP 200.
  res.status(200).json({ success: true, data });
};
// Save a new assessment for the selected Control.
export const assessControlEffectiveness: RequestHandler = async (req, res) => {
  // Validate and read the Control ID from the URL path.
  const { controlId } = controlEffectivenessParamsSchema.parse(req.params);
  // Let the service check permission and assessment rules before saving.
  const data = await controlEffectivenessService.assess(
    // Use the signed-in user as the person performing this action.
    userId(res.locals.authenticatedUserId),
    controlId,
    // Validate the assessment data submitted by the form.
    assessControlEffectivenessBodySchema.parse(req.body),
  );
  // Return the new assessment result with HTTP 201.
  res.status(201).json({ success: true, data });
};

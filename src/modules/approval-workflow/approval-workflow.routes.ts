import { Router } from 'express';
import { authenticate, authorize } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { approvalWorkflowController } from './approval-workflow.controller.js';
import { queryWorkflowDefinitionsSchema } from './dto/query-workflows.dto.js';

export const approvalWorkflowRouter = Router();

approvalWorkflowRouter.get(
  '/',
  authenticate,
  authorize('workflows.read'),
  validate({ query: queryWorkflowDefinitionsSchema }),
  asyncHandler((req, res) => approvalWorkflowController.listWorkflowDefinitions(req, res)),
);

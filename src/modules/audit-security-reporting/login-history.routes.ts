import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { listLoginHistoryQuerySchema } from './dto/list-login-history.dto.js';
import { listLoginHistory } from './login-history.controller.js';

export const loginHistoryRouter = Router();

loginHistoryRouter.get(
  '/',
  authenticate,
  validate({ query: listLoginHistoryQuerySchema }),
  asyncHandler(listLoginHistory),
);

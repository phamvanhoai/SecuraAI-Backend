import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/authentication-account/index.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

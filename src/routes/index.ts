import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';
import { healthRouter } from '../modules/health/health.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';
import { businessModules } from '../modules/index.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
for (const module of businessModules) apiRouter.use(module.routePrefix, module.router);

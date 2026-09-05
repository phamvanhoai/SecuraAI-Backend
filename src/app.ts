import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './common/middleware/error-handler.js';
import { openApiSpec } from './docs/openapi.js';
import { swaggerUiHtml } from './docs/swagger-ui.js';
import { apiRouter } from './routes/index.js';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.use(pinoHttp({ logger, genReqId: (req, res) => {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  }}));
  app.use(helmet(env.SWAGGER_ENABLED ? { contentSecurityPolicy: false } : {}));
  app.use(cors({ origin: env.corsOrigins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(hpp());
  app.use(compression());
  if (env.SWAGGER_ENABLED) {
    app.use(
      '/swagger-ui',
      express.static('public/swagger-ui', { dotfiles: 'deny', fallthrough: false, index: false }),
    );
    app.get('/docs/openapi.json', (_req, res) => res.json(openApiSpec));
    app.get(['/docs', '/docs/'], (_req, res) => res.type('html').send(swaggerUiHtml));
  }
  app.use(env.API_PREFIX, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

const app = createApp();

export default app;

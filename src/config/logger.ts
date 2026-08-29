import pino from 'pino';
import { env } from './env.js';

const options: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'refreshToken', '*.password'],
    censor: '[REDACTED]',
  },
};
if (env.NODE_ENV === 'development') {
  options.transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } };
}
export const logger = pino(options);

import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type RequestSchemas = Partial<Record<'body' | 'params' | 'query', ZodType>>;

export const validate = (schemas: RequestSchemas): RequestHandler => (req, _res, next) => {
  for (const key of ['body', 'params', 'query'] as const) {
    const schema = schemas[key];
    if (schema) {
      const parsed = schema.parse(req[key]);
      try {
        (req as unknown as Record<string, unknown>)[key] = parsed;
      } catch {
        Object.assign(req[key], parsed as object);
      }
    }
  }
  next();
};

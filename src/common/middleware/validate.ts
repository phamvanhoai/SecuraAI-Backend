import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type RequestSchemas = Partial<Record<'body' | 'params' | 'query', ZodType>>;

export const validate = (schemas: RequestSchemas): RequestHandler => (req, _res, next) => {
  for (const key of ['body', 'params', 'query'] as const) {
    const schema = schemas[key];
    if (schema) Object.assign(req[key], schema.parse(req[key]) as object);
  }
  next();
};

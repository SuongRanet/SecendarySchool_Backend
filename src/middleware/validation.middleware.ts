import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/app-error';
import type { FieldError } from '../utils/app-error';

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export const toFieldErrors = (error: ZodError): FieldError[] =>
  error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }));

/**
 * Validates and coerces `body`, `query` and `params` against Zod schemas before a
 * controller runs. The parsed values replace the raw ones so controllers always
 * work with typed, trimmed and coerced input.
 */
export const validate =
  (schemas: RequestSchemas): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params'];
      }

      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        // `req.query` is a getter in Express 4; replace its contents in place.
        Object.keys(req.query).forEach((key) => {
          delete (req.query as Record<string, unknown>)[key];
        });
        Object.assign(req.query, parsedQuery);
      }

      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(AppError.validation('Validation failed', toFieldErrors(error)));
        return;
      }

      next(error);
    }
  };

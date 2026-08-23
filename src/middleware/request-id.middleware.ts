import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Assigns a correlation id to every request and echoes it back so a client error
 * report can be matched to a server log line.
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming.slice(0, 64) : randomUUID();

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

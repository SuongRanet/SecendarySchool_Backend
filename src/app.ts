import express from 'express';
import type { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config';
import { checkDatabaseConnection } from './database/connection';
import {
  errorHandler,
  globalRateLimiter,
  notFoundHandler,
  requestId,
  requestLogger,
} from './middleware';
import routes from './routes';
import { sendSuccess } from './utils/api-response';
import { AppError } from './utils/app-error';

export const createApp = (): Application => {
  const app = express();

  // Behind a reverse proxy the client IP arrives in X-Forwarded-For; rate
  // limiting and audit logging both depend on getting the real address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) {
          callback(null, true);
          return;
        }

        callback(AppError.forbidden('Origin is not allowed by CORS', 'CORS_ORIGIN_DENIED'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(requestId);
  app.use(requestLogger);

  app.get('/health', async (_req: Request, res: Response) => {
    const databaseReachable = await checkDatabaseConnection();

    return sendSuccess(
      res,
      {
        status: databaseReachable ? 'ok' : 'degraded',
        environment: env.NODE_ENV,
        database: databaseReachable ? 'up' : 'down',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      'Health check completed',
      databaseReachable ? 200 : 503,
    );
  });

  app.use(env.API_PREFIX, globalRateLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

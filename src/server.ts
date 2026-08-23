import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config';
import { checkDatabaseConnection, closePool } from './database/connection';
import { logger } from './utils/logger';

const start = async (): Promise<void> => {
  const databaseReachable = await checkDatabaseConnection();

  if (!databaseReachable) {
    logger.error('Cannot reach PostgreSQL. Check DATABASE_URL and that the server is running.');
    process.exit(1);
  }

  const app = createApp();

  const server: Server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}${env.API_PREFIX}`, {
      environment: env.NODE_ENV,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);

    server.close(async () => {
      await closePool();
      logger.info('Shutdown complete');
      process.exit(0);
    });

    // Do not let a hung connection keep the process alive forever.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });
};

void start();

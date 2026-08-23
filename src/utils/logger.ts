import { env } from '../config';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const shouldLog = (level: LogLevel): boolean =>
  LEVEL_WEIGHT[level] <= LEVEL_WEIGHT[env.LOG_LEVEL as LogLevel];

const serialize = (level: LogLevel, message: string, meta?: unknown): string => {
  const timestamp = new Date().toISOString();

  if (env.isProduction) {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...(meta === undefined ? {} : { meta }),
    });
  }

  const suffix = meta === undefined ? '' : ` ${formatMeta(meta)}`;
  return `${timestamp} [${level.toUpperCase()}] ${message}${suffix}`;
};

const formatMeta = (meta: unknown): string => {
  if (meta instanceof Error) {
    return `\n${meta.stack ?? meta.message}`;
  }

  try {
    return JSON.stringify(meta);
  } catch {
    return String(meta);
  }
};

const write = (level: LogLevel, message: string, meta?: unknown): void => {
  if (!shouldLog(level)) {
    return;
  }

  const line = serialize(level, message, meta);

  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
};

export const logger = {
  error: (message: string, meta?: unknown): void => write('error', message, meta),
  warn: (message: string, meta?: unknown): void => write('warn', message, meta),
  info: (message: string, meta?: unknown): void => write('info', message, meta),
  debug: (message: string, meta?: unknown): void => write('debug', message, meta),
};

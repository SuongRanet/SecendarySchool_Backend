import type { AuthenticatedUser } from './index';

declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`; present on every protected route. */
      user?: AuthenticatedUser;
      /** Correlation id assigned to every incoming request. */
      requestId: string;
    }
  }
}

export {};

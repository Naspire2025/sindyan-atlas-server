import type { AuthenticatedUser } from '../types/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: number;
    }
  }
}

export {};

import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/app-error.util';

export function requireTrustedOrigin(request: Request, _response: Response, next: NextFunction): void {
  if (env.frontendOrigins.includes(request.get('origin') ?? '')) {
    next();
    return;
  }
  next(new AppError(403, 'Request origin is not allowed.'));
}

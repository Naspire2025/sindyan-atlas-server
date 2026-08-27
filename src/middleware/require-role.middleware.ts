import type { NextFunction, Request, Response } from 'express';
import type { OrganizationRole } from '../types/auth';
import { AppError } from '../utils/app-error.util';

export function requireRole(role: OrganizationRole) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (request.user?.role !== role) {
      next(new AppError(403, 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

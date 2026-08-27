import type { NextFunction, Request, Response } from 'express';

export function applySecurityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

import type { NextFunction, Request, Response } from 'express';

const SENSITIVE_PATHS = new Set(['/api/auth/login', '/api/auth/change-password', '/api/auth/invitations', '/api/auth/csrf']);

function isSensitivePath(path: string): boolean {
  if (SENSITIVE_PATHS.has(path)) return true;
  return /^\/api\/auth\/invitations\/.*\/accept$/.test(path);
}

function redactedBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '{}';
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (/password|token|secret|csrf|key/i.test(key)) {
      copy[key] = '[REDACTED]';
    } else {
      copy[key] = value;
    }
  }
  return JSON.stringify(copy);
}

export function requestLogger(request: Request, response: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const { method, originalUrl, ip } = request;
  const hasBody = request.headers['content-type'] && Object.keys(request.body ?? {}).length > 0;
  const bodyLog = hasBody ? ` body=${redactedBody(request.body)}` : '';

  if (isSensitivePath(request.path)) {
    console.log(`[api] ${method} ${originalUrl} from=${ip} body=[REDACTED]`);
  } else {
    console.log(`[api] ${method} ${originalUrl} from=${ip}${bodyLog}`);
  }

  response.on('finish', () => {
    const duration = Date.now() - startedAt;
    console.log(`[api] ${method} ${originalUrl} -> ${response.statusCode} ${duration}ms`);
  });

  next();
}

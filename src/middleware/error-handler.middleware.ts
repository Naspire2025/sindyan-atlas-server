import type { ErrorRequestHandler } from 'express';
import { isAppError } from '../utils/app-error.util';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const context = `${request.method} ${request.originalUrl}`;

  if (isAppError(error)) {
    console.log(`[api] ${context} -> ${error.statusCode} ${error.message}`);
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(`[api] ${context} unhandled backend error`, error.message);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
};

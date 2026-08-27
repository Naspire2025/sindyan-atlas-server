import type { ErrorRequestHandler } from 'express';
import { isAppError } from '../utils/app-error.util';

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (isAppError(error)) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error('Unhandled backend error', error);
  response.status(500).json({ error: 'An unexpected server error occurred.' });
};

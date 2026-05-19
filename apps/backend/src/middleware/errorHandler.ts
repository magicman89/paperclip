import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, unknown>;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';

  // Log full error server-side (never expose stack to client in production)
  console.error('[Error]', {
    code,
    message,
    statusCode,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: _req.path,
    method: _req.method,
  });

  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(err.details != null && typeof err.details === 'object' ? { details: err.details } : {}),
    },
  });
}

export function createError(message: string, statusCode = 500, code = 'ERROR', details?: Record<string, unknown>): ApiError {
  const err: ApiError = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.details = details;
  return err;
}

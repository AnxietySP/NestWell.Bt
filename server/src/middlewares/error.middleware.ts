import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, statusCode = 400, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join('.');
    return res.status(400).json({
      message: first ? `${field ? `${field}: ` : ''}${first.message}` : 'Invalid request.',
      code: 'VALIDATION_ERROR',
      fields: Object.fromEntries(err.issues.map((i) => [i.path.join('.'), i.message])),
    });
  }

  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error('[ServerError]', err);
  }
  const appErr = err instanceof AppError ? err : null;
  res.status(status).json({
    message:
      status === 500 && env.NODE_ENV === 'production'
        ? 'An unexpected server error occurred.'
        : err.message,
    ...(appErr?.code ? { code: appErr.code } : {}),
    ...(appErr?.details ?? {}),
  });
}

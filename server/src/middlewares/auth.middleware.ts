import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload, Role } from '../utils/security.utils';
import { AppError } from './error.middleware';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Requires a valid access token whose `verified` claim is true.
 * Access tokens are only minted for accounts with a verified registered email, and the
 * refresh endpoint re-checks the database, so an unverified account can never hold a
 * usable session. Tokens issued before email verification existed carry no claim and
 * are rejected with 401 so the client re-authenticates.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication required.', 401));
  }
  const token = authHeader.slice(7);
  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new AppError('Invalid or expired access token.', 401));
  }
  if (payload.verified === undefined) {
    return next(new AppError('Your session is out of date. Please sign in again.', 401));
  }
  if (payload.verified !== true) {
    return next(
      new AppError('Verify your registered email address to continue.', 403, 'EMAIL_NOT_VERIFIED', {
        email: payload.email,
      })
    );
  }
  req.user = payload;
  next();
}

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to access this resource.', 403));
    }
    next();
  };
}

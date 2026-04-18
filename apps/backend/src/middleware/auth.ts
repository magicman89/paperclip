import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
  supabaseToken?: string;
}

/**
 * Authenticates requests using Supabase JWT from Authorization header.
 * Sets req.user on success.
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    // Verify with Supabase JWT secret (never use service role key for verification)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as {
      sub: string;
      email?: string;
    };

    if (!decoded.sub) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid token payload.' },
      });
      return;
    }

    req.user = { id: decoded.sub, email: decoded.email };
    req.supabaseToken = token;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: { code: 'TOKEN_EXPIRED', message: 'Session expired. Please log in again.' },
      });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid token.' },
      });
      return;
    }
    next(err);
  }
}

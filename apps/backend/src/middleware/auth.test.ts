import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Mock JWT_SECRET
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

describe('Auth Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let nextFn: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
      path: '/test',
      method: 'GET',
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    nextFn = jest.fn();
  });

  it('should return 401 if no Authorization header', () => {
    authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header.' },
    });
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('should return 401 if Authorization header does not start with Bearer', () => {
    mockReq.headers = { authorization: 'Basic abc123' };

    authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('should return 401 for invalid token', () => {
    mockReq.headers = { authorization: 'Bearer invalid.token.here' };

    authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, nextFn);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_TOKEN', message: 'Invalid token.' },
    });
    expect(nextFn).not.toHaveBeenCalled();
  });

  it('should set req.user for valid token', () => {
    const payload = { sub: 'user-123', email: 'test@example.com' };
    const token = jwt.sign(payload, process.env.JWT_SECRET!);
    mockReq.headers = { authorization: `Bearer ${token}` };

    authMiddleware(mockReq as AuthenticatedRequest, mockRes as Response, nextFn);

    expect(nextFn).toHaveBeenCalled();
    expect((mockReq as AuthenticatedRequest).user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
    });
    expect((mockReq as AuthenticatedRequest).supabaseToken).toBe(token);
  });
});

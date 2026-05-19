import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../utils/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(createError('Validation failed', 400, 'VALIDATION_ERROR', result.error.flatten()));
      return;
    }
    req.body = result.data;
    next();
  };
}

// POST /api/v1/auth/signup
authRouter.post('/signup', validateBody(signupSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, full_name } = req.body;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (error) {
      if (error.message.includes('already exists')) {
        throw createError('An account with this email already exists.', 409, 'USER_EXISTS');
      }
      throw createError(error.message, 400, 'AUTH_ERROR');
    }

    // Create profile
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        full_name,
        subscription_tier: 'free',
        signal_credits: 3,
      });
    }

    res.status(201).json({
      data: {
        user: { id: data.user?.id, email: data.user?.email },
        message: 'Account created successfully',
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
authRouter.post('/login', validateBody(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw createError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
    }

    res.json({
      data: {
        user: { id: data.user?.id, email: data.user?.email },
        session: {
          access_token: data.session?.access_token,
          expires_at: data.session?.expires_at,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
authRouter.post('/logout', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.auth.signOut();
    res.json({ data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/me
authRouter.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const supabase = getSupabaseAdmin();
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      throw createError('Profile not found', 404, 'NOT_FOUND');
    }

    res.json({
      data: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        subscription_tier: profile.subscription_tier,
        signal_credits: profile.signal_credits,
        stripe_customer_id: profile.stripe_customer_id,
        created_at: profile.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
});

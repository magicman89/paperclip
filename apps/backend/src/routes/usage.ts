import { Router, Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../utils/supabase';
import { AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

export const usageRouter = Router();

// GET /api/v1/usage
usageRouter.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const supabase = getSupabaseAdmin();

    const [profileResult, usageResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('subscription_tier, signal_credits, last_credit_reset')
        .eq('id', req.user.id)
        .single(),
      supabase
        .from('credit_usage')
        .select('action, credits_used, created_at')
        .eq('user_id', req.user.id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false }),
    ]);

    if (profileResult.error || !profileResult.data) {
      throw createError('Profile not found', 404, 'NOT_FOUND');
    }

    const totalUsed = (usageResult.data || []).reduce((sum, u) => sum + u.credits_used, 0);
    const limit = profileResult.data.subscription_tier === 'free' ? 3
      : profileResult.data.subscription_tier === 'pro' ? 50 : 999999;

    res.json({
      data: {
        tier: profileResult.data.subscription_tier,
        credits_remaining: profileResult.data.signal_credits,
        credits_used_period: totalUsed,
        credit_limit: limit,
        last_reset: profileResult.data.last_credit_reset,
        usage_by_action: Object.fromEntries(
          ['signal_view', 'alert_sent', 'api_request', 'export'].map((action) => [
            action,
            (usageResult.data || []).filter((u) => u.action === action).length,
          ])
        ),
      },
    });
  } catch (err) {
    next(err);
  }
});

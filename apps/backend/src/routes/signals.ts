import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin, getSupabaseUser } from '../utils/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

/**
 * Handles credit deduction for an individual signal view (BUL-177 fix).
 * - Free users: deduct 1 credit via RPC, record in credit_usage table.
 * - Paid users (pro/enterprise): no deduction needed.
 * - Free users with 0 credits: throws 402 INSUFFICIENT_CREDITS.
 *
 * @param userId        - The authenticated user's UUID
 * @param signalId      - The signal being viewed
 * @param getAdmin      - Factory so this function remains testable without module mocking
 */
export async function deductCreditForSignalView(
  userId: string,
  signalId: string,
  getAdmin: () => SupabaseClient
): Promise<void> {
  const admin = getAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, signal_credits')
    .eq('id', userId)
    .single();

  const isFree = profile?.subscription_tier === 'free';
  const hasCredits = typeof profile?.signal_credits === 'number' && profile.signal_credits > 0;

  if (isFree) {
    if (!hasCredits) {
      throw createError('Insufficient credits. Upgrade to Pro or Enterprise.', 402, 'INSUFFICIENT_CREDITS');
    }
    await admin.rpc('deduct_signal_credit', { user_id: userId });
    await admin.from('credit_usage').insert({
      user_id: userId,
      action: 'signal_view',
      credits_used: 1,
      signal_id: signalId,
    });
  }
}

export const signalsRouter = Router();

const signalQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  trader_id: z.string().uuid().optional(),
  symbol: z.string().optional(),
  exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit']).optional(),
  status: z.enum(['active', 'closed', 'expired', 'cancelled']).optional(),
  type: z.enum(['buy', 'sell', 'long', 'short', 'entry', 'exit']).optional(),
});

// GET /api/v1/signals
signalsRouter.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const query = signalQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw createError('Invalid query parameters', 400, 'VALIDATION_ERROR', query.error.flatten());
    }

    const { cursor, limit, trader_id, symbol, exchange, status, type } = query.data;
    const supabase = getSupabaseUser();

    let queryBuilder = supabase
      .from('signals')
      .select('*, traders(id, name, platform, image_url, risk_score)', { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit + 1); // Fetch one extra to determine if there's a next page

    if (cursor) {
      queryBuilder = queryBuilder.lt('created_at', cursor);
    }
    if (trader_id) queryBuilder = queryBuilder.eq('trader_id', trader_id);
    if (symbol) queryBuilder = queryBuilder.ilike('symbol', `%${symbol}%`);
    if (exchange) queryBuilder = queryBuilder.eq('exchange', exchange);
    if (status) queryBuilder = queryBuilder.eq('status', status);
    if (type) queryBuilder = queryBuilder.eq('signal_type', type);

    const { data, error, count } = await queryBuilder;

    if (error) {
      throw createError('Failed to fetch signals', 500, 'DATABASE_ERROR');
    }

    const hasMore = data && data.length > limit;
    const signals = hasMore ? data.slice(0, limit) : data;

    // Credit deduction moved to GET /signals/:id (individual signal views only).
    // Deduction on the list endpoint caused free users to exhaust 3 credits
    // in a single page load (20 signals × 1 credit each).

    res.json({
      data: signals,
      meta: {
        total: count || 0,
        hasMore,
        limit,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/signals/:id
signalsRouter.get('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const supabase = getSupabaseUser();
    const { data, error } = await supabase
      .from('signals')
      .select('*, traders(id, name, platform, platform_handle, description, image_url, win_rate, risk_score)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw createError('Signal not found', 404, 'NOT_FOUND');
    }

    // Credit check and deduction BEFORE response (BUL-177 fix)
    // Enterprise has -1 credits (unlimited) — skip all checks
    await deductCreditForSignalView(req.user.id, data.id, getSupabaseAdmin);

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../utils/supabase';
import { authMiddleware } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

export const tradersRouter = Router();

const traderQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  platform: z.enum(['twitter', 'tradingview', 'binance', 'bybit', 'custom']).optional(),
  min_win_rate: z.coerce.number().min(0).max(100).optional(),
  max_risk: z.coerce.number().min(1).max(10).optional(),
  sort_by: z.enum(['win_rate', 'risk_score', 'total_trades', 'follower_count']).default('win_rate'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

// GET /api/v1/traders
tradersRouter.get('/', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = traderQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw createError('Invalid query parameters', 400, 'VALIDATION_ERROR', query.error.flatten());
    }

    const { limit, platform, min_win_rate, max_risk, sort_by, sort_order } = query.data;
    const supabase = getSupabaseAdmin();

    let queryBuilder = supabase
      .from('traders')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .is('deleted_at', null)
      .order(sort_by, { ascending: sort_order === 'asc' })
      .limit(limit);

    if (platform) queryBuilder = queryBuilder.eq('platform', platform);
    if (min_win_rate) queryBuilder = queryBuilder.gte('win_rate', min_win_rate);
    if (max_risk) queryBuilder = queryBuilder.lte('risk_score', max_risk);

    const { data, error, count } = await queryBuilder;

    if (error) {
      throw createError('Failed to fetch traders', 500, 'DATABASE_ERROR');
    }

    res.json({
      data: data || [],
      meta: { total: count || 0, limit },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/traders/:id
tradersRouter.get('/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('traders')
      .select('*, signals(id, symbol, signal_type, status, pnl_percentage, created_at, exchange)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw createError('Trader not found', 404, 'NOT_FOUND');
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

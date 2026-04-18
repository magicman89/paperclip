import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin } from '../utils/supabase';
import { AuthenticatedRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

export const analyticsRouter = Router();

const portfolioQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});

// GET /api/v1/analytics/portfolio
analyticsRouter.get('/portfolio', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw createError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const query = portfolioQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw createError('Invalid parameters', 400, 'VALIDATION_ERROR', query.error.flatten());
    }

    const { period } = query.data;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const supabase = getSupabaseAdmin();

    const [snapshotsResult, positionsResult] = await Promise.all([
      supabase
        .from('portfolio_snapshots')
        .select('*')
        .eq('user_id', req.user.id)
        .gte('snapshot_date', since.split('T')[0])
        .order('snapshot_date', { ascending: true }),
      supabase
        .from('tracked_positions')
        .select('*')
        .eq('user_id', req.user.id)
        .gte('opened_at', since)
        .order('opened_at', { ascending: false }),
    ]);

    const snapshots = snapshotsResult.data || [];
    const positions = positionsResult.data || [];

    const currentSnapshot = snapshots[snapshots.length - 1] || null;
    const openPositions = positions.filter((p) => p.status === 'open');
    const closedPositions = positions.filter((p) => p.status === 'closed');

    const winRate = closedPositions.length > 0
      ? (closedPositions.filter((p) => p.pnl > 0).length / closedPositions.length) * 100
      : 0;

    const totalPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);

    res.json({
      data: {
        period,
        current_value_usd: currentSnapshot?.total_value_usd || 0,
        pnl_24h: currentSnapshot?.total_pnl_24h || 0,
        pnl_7d: currentSnapshot?.total_pnl_7d || 0,
        pnl_30d: currentSnapshot?.total_pnl_30d || 0,
        open_positions: openPositions.length,
        closed_positions: closedPositions.length,
        win_rate: Math.round(winRate * 100) / 100,
        total_pnl: Math.round(totalPnl * 100) / 100,
        snapshots: snapshots.map((s) => ({
          date: s.snapshot_date,
          value: s.total_value_usd,
        })),
        recent_positions: positions.slice(0, 20),
      },
    });
  } catch (err) {
    next(err);
  }
});

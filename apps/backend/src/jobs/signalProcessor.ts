import { getSupabaseAdmin } from '../utils/supabase';
import { binanceService } from '../services/binanceService';
import { broadcastSignal } from '../websocket/server';

const PROCESS_INTERVAL_MS = 30_000; // 30 seconds

export interface SignalCheck {
  signal_type: 'buy' | 'sell' | 'long' | 'short' | 'entry' | 'exit';
  entry_price: number;
  target_price: number | null;
  stop_loss: number | null;
}

/**
 * Checks if a signal should be closed based on current price and exit conditions.
 * Returns { shouldClose, pnlPercentage }.
 */
export function checkSignalExit(
  currentPrice: number,
  signal: SignalCheck
): { shouldClose: boolean; pnlPercentage: number | null } {
  const isLong = ['buy', 'long', 'entry'].includes(signal.signal_type);

  if (isLong) {
    if (signal.target_price && currentPrice >= signal.target_price) {
      return {
        shouldClose: true,
        pnlPercentage: ((currentPrice - signal.entry_price) / signal.entry_price) * 100,
      };
    }
    if (signal.stop_loss && currentPrice <= signal.stop_loss) {
      return {
        shouldClose: true,
        pnlPercentage: ((currentPrice - signal.entry_price) / signal.entry_price) * 100,
      };
    }
  } else {
    if (signal.target_price && currentPrice <= signal.target_price) {
      return {
        shouldClose: true,
        pnlPercentage: ((signal.entry_price - currentPrice) / signal.entry_price) * 100,
      };
    }
    if (signal.stop_loss && currentPrice >= signal.stop_loss) {
      return {
        shouldClose: true,
        pnlPercentage: ((signal.entry_price - currentPrice) / signal.entry_price) * 100,
      };
    }
  }

  return { shouldClose: false, pnlPercentage: null };
}

/**
 * Background job that processes active signals:
 * - Checks exit conditions (target price, stop loss hit)
 * - Updates signal status and PnL when closed
 * - Notifies subscribed users via WebSocket
 */
export function startSignalProcessor(): void {
  console.log('[SignalProcessor] Starting...');

  const process = async () => {
    try {
      const supabase = getSupabaseAdmin();

      // Fetch active signals with their traders
      const { data: signals, error } = await supabase
        .from('signals')
        .select('*, traders(name)')
        .eq('status', 'active')
        .not('target_price', 'is', null)
        .not('stop_loss', 'is', null)
        .limit(50);

      if (error) {
        console.error('[SignalProcessor] Failed to fetch signals:', error);
        return;
      }

      if (!signals || signals.length === 0) return;

      for (const signal of signals) {
        const symbol = signal.symbol;
        const ticker = await binanceService.getTicker(symbol);

        if (!ticker) continue;

        const currentPrice = ticker.price;
        let newStatus = signal.status;
        let closePrice: number | null = null;
        let pnlPercentage: number | null = null;

        // Check exit conditions
        if (signal.signal_type === 'buy' || signal.signal_type === 'long' || signal.signal_type === 'entry') {
          // For long/buy: exit if target hit or stop loss hit
          if (signal.target_price && currentPrice >= signal.target_price) {
            newStatus = 'closed';
            closePrice = currentPrice;
            pnlPercentage = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
          } else if (signal.stop_loss && currentPrice <= signal.stop_loss) {
            newStatus = 'closed';
            closePrice = currentPrice;
            pnlPercentage = ((currentPrice - signal.entry_price) / signal.entry_price) * 100;
          }
        } else if (signal.signal_type === 'sell' || signal.signal_type === 'short') {
          // For short/sell: exit if target hit or stop loss hit
          if (signal.target_price && currentPrice <= signal.target_price) {
            newStatus = 'closed';
            closePrice = currentPrice;
            pnlPercentage = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
          } else if (signal.stop_loss && currentPrice >= signal.stop_loss) {
            newStatus = 'closed';
            closePrice = currentPrice;
            pnlPercentage = ((signal.entry_price - currentPrice) / signal.entry_price) * 100;
          }
        }

        if (newStatus !== signal.status) {
          const closedAt = new Date().toISOString();

          // Optimistic locking: only update if still active (prevents race condition between job runs)
          const { data: updated } = await supabase
            .from('signals')
            .update({
              status: newStatus,
              exit_price: closePrice,
              pnl_percentage: pnlPercentage,
              closed_at: closedAt,
              updated_at: closedAt,
            })
            .eq('id', signal.id)
            .eq('status', 'active')  // only if still active (optimistic lock)
            .select('id, symbol, signal_type, status, exit_price, pnl_percentage, traders(name)')
            .single();

          if (updated) {
            console.log(`[SignalProcessor] Signal ${signal.id} (${symbol}) ${signal.signal_type} closed at ${closePrice}. PnL: ${pnlPercentage?.toFixed(2)}%`);
            // Emit WebSocket notification to subscribed users
            broadcastSignal(`signal:${signal.trader_id}`, {
              signalId: signal.id,
              symbol: signal.symbol,
              status: newStatus,
              exitPrice: closePrice,
              pnlPercentage,
              traderName: (signal.traders as { name?: string } | null)?.name,
              timestamp: closedAt,
            });
          } else {
            console.log(`[SignalProcessor] Signal ${signal.id} already closed by concurrent run`);
          }
        }
      }
    } catch (err) {
      console.error('[SignalProcessor] Error:', err);
    }
  };

  // Run immediately then on interval
  process();
  setInterval(process, PROCESS_INTERVAL_MS);
  console.log(`[SignalProcessor] Running. Processing every ${PROCESS_INTERVAL_MS / 1000}s.`);
}

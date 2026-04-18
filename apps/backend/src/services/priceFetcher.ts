import { binanceService, TickerData } from './binanceService';
import { coinbaseService, CoinbaseTickerData } from './coinbaseService';
import { getSupabaseAdmin } from '../utils/supabase';

// Symbols to track
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT'];

/**
 * Fetches and caches prices from all exchanges every 10 seconds.
 * Updates the `price_cache` table in Supabase.
 */
export function startPriceFetcher(): void {
  console.log('[PriceFetcher] Starting...');

  const fetchAndCache = async () => {
    try {
      const supabase = getSupabaseAdmin();

      const tickers = await Promise.allSettled(
        SYMBOLS.map(async (symbol) => {
          const [binance, coinbase] = await Promise.all([
            binanceService.getTicker(symbol),
            coinbaseService.getTicker(symbol.replace('USDT', '')),
          ]);
          return { binance, coinbase, symbol };
        })
      );

      const cacheRows = tickers
        .reduce<Array<{ exchange: string; symbol: string; price: number; volume_24h: number; change_24h: number; high_24h: number; low_24h: number; fetched_at: string }>>((acc, r) => {
          if (r.status !== 'fulfilled' || !r.value.binance) return acc;
          const { binance, symbol } = r.value;
          acc.push({
            exchange: 'binance',
            symbol,
            price: binance.price,
            volume_24h: binance.volume24h,
            change_24h: binance.change24h,
            high_24h: binance.high24h,
            low_24h: binance.low24h,
            fetched_at: new Date().toISOString(),
          });
          return acc;
        }, []);

      if (cacheRows.length > 0) {
        for (const row of cacheRows) {
          await supabase.from('price_cache').upsert(row, {
            onConflict: 'exchange,symbol',
          });
        }
      }
    } catch (err) {
      console.error('[PriceFetcher] Error:', err);
    }
  };

  // Fetch immediately, then every 10 seconds
  fetchAndCache();
  setInterval(fetchAndCache, 10000);

  // Also start WebSocket subscriptions for real-time updates
  binanceService.subscribe(SYMBOLS, async (data) => {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('price_cache').upsert({
        exchange: 'binance',
        symbol: data.symbol,
        price: data.price,
        volume_24h: data.volume24h,
        change_24h: data.change24h,
        high_24h: data.high24h,
        low_24h: data.low24h,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'exchange,symbol' });
    } catch (err) {
      // Swallow — WebSocket updates are best-effort
    }
  });

  console.log('[PriceFetcher] Running. Fetching every 10s + WebSocket real-time updates.');
}

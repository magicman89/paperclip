/**
 * Bullspot Background Workers — Separate Railway Service
 *
 * Runs independently from the API server. Handles:
 * - PriceFetcher: fetches and caches prices from Binance/Coinbase every 10s
 * - SignalProcessor: checks exit conditions every 30s
 * - CreditResetter: resets credits every hour
 *
 * Workers write to Supabase DB. The API server subscribes to Supabase real-time
 * changes on the signals table and broadcasts via WebSocket.
 *
 * Usage: npm run worker (or `node dist/worker.js` in production)
 */

import { initializeSupabase } from './utils/supabase';
import { startPriceFetcher } from './services/priceFetcher';
import { startSignalProcessor } from './jobs/signalProcessor';
import { startCreditResetter } from './jobs/creditResetter';

async function main() {
  console.log('[Worker] Bullspot Background Workers starting...');
  console.log(`[Worker] Environment: ${process.env.NODE_ENV || 'development'}`);

  // Initialize Supabase connection
  initializeSupabase();

  // Start all background jobs
  startPriceFetcher();
  startSignalProcessor();
  startCreditResetter();

  console.log('[Worker] All workers started successfully.');
}

main().catch((err) => {
  console.error('[Worker] Fatal startup error:', err);
  process.exit(1);
});

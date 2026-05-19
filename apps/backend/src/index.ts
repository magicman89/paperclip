import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'http';
import { initializeWebSocket, broadcastSignal } from './websocket/server';
import { authRouter } from './routes/auth';
import { signalsRouter } from './routes/signals';
import { tradersRouter } from './routes/traders';
import { exchangeKeysRouter } from './routes/exchangeKeys';
import { pricingRouter } from './routes/pricing';
import { webhookRouter } from './routes/webhooks';
import { usageRouter } from './routes/usage';
import { analyticsRouter } from './routes/analytics';
import { emailRouter } from './routes/email';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { initializeSupabase, getSupabaseAdmin } from './utils/supabase';

const app = express();
const httpServer = createServer(app);

// Trust proxy for rate limiting behind Vercel/Railway
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());

// Stripe webhooks need raw body BEFORE json parsing
app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), webhookRouter);

// General JSON parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 req/min default
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' } },
  skip: (req) => req.path === '/health',
});

app.use('/api', globalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/signals', signalsRouter);
app.use('/api/v1/traders', tradersRouter);
app.use('/api/v1/exchange-keys', authMiddleware, exchangeKeysRouter);
app.use('/api/v1/pricing', pricingRouter);
app.use('/api/v1/usage', authMiddleware, usageRouter);
app.use('/api/v1/analytics', authMiddleware, analyticsRouter);
app.use('/api/v1/email', emailRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
});

// Error handler
app.use(errorHandler);

// Initialize WebSocket
initializeWebSocket(httpServer);

// Initialize Supabase
initializeSupabase();

// Subscribe to Supabase real-time signal changes for WebSocket broadcasting
// Workers write to DB; this pushes updates to connected WebSocket clients
subscribeToSignalRealtime();

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`[Bullspot API] Running on http://${HOST}:${PORT}`);
  console.log(`[Bullspot API] Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { app, httpServer };

/**
 * Subscribes to Supabase real-time changes on the signals table.
 * When workers update signal status (e.g., close a signal), this pushes
 * the update to all WebSocket clients subscribed to the trader channel.
 *
 * Requires: `ALTER PUBLICATION supabase_realtime ADD TABLE signals` (migration 004)
 * and signals enabled in Supabase Dashboard > Database > Replication.
 */
function subscribeToSignalRealtime(): void {
  if (process.env.NODE_ENV === 'test') return; // Skip in tests

  try {
    const supabase = getSupabaseAdmin();

    const channel = supabase
      .channel('signals-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'signals',
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            trader_id: string;
            symbol: string;
            status: string;
            exit_price: number | null;
            pnl_percentage: number | null;
            closed_at: string | null;
          };

          if (updated.status === 'closed') {
            broadcastSignal(`signal:${updated.trader_id}`, {
              signalId: updated.id,
              symbol: updated.symbol,
              status: updated.status,
              exitPrice: updated.exit_price,
              pnlPercentage: updated.pnl_percentage,
              timestamp: updated.closed_at || new Date().toISOString(),
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Signals subscription status: ${status}`);
      });

    console.log('[Realtime] Subscribed to signals table for WebSocket broadcasting.');
  } catch (err) {
    console.error('[Realtime] Failed to subscribe to signals:', err);
  }
}

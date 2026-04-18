import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import crypto from 'crypto';

export interface TickerData {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  exchange: 'binance';
}

export interface CandlestickData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

type TickerCallback = (data: TickerData) => void;

export class BinanceService {
  private ws: WebSocket | null = null;
  private restClient: AxiosInstance;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private tickerCallbacks: TickerCallback[] = [];
  private subscribedSymbols: Set<string> = new Set();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.restClient = axios.create({
      baseURL: 'https://api.binance.com',
      timeout: 10000,
    });
  }

  /**
   * Subscribe to real-time ticker updates for given symbols.
   * @param symbols Array of symbols like ['BTCUSDT', 'ETHUSDT']
   * @param callback Called whenever a ticker update arrives
   */
  subscribe(symbols: string[], callback: TickerCallback): void {
    symbols.forEach((s) => this.subscribedSymbols.add(s.toUpperCase()));
    this.tickerCallbacks.push(callback);
    this.reconnect();
  }

  private reconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    const streams = Array.from(this.subscribedSymbols)
      .map((s) => `${s.toLowerCase()}@ticker`)
      .join('/');

    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log(`[Binance WS] Connected. Subscribed to ${this.subscribedSymbols.size} streams.`);
        this.reconnectAttempts = 0;

        // Ping every 30s to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 30000);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.stream && msg.data) {
            const ticker = msg.data;
            const tickerData: TickerData = {
              symbol: ticker.s,
              price: parseFloat(ticker.c),
              change24h: parseFloat(ticker.P),
              high24h: parseFloat(ticker.h),
              low24h: parseFloat(ticker.l),
              volume24h: parseFloat(ticker.v),
              exchange: 'binance',
            };
            this.tickerCallbacks.forEach((cb) => cb(tickerData));
          }
        } catch (err) {
          console.error('[Binance WS] Parse error:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Binance WS] Error:', err.message);
      });

      this.ws.on('close', () => {
        console.log('[Binance WS] Disconnected. Attempting reconnect...');
        if (this.pingInterval) clearInterval(this.pingInterval);

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          setTimeout(() => this.reconnect(), delay);
        } else {
          console.error('[Binance WS] Max reconnect attempts reached. Giving up.');
        }
      });
    } catch (err) {
      console.error('[Binance WS] Connection error:', err);
    }
  }

  /**
   * Fetch current price for a symbol via REST API.
   */
  async getTicker(symbol: string): Promise<TickerData | null> {
    try {
      const response = await this.restClient.get('/api/v3/ticker/24hr', {
        params: { symbol: symbol.toUpperCase() },
      });
      const t = response.data;
      return {
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
        volume24h: parseFloat(t.volume),
        exchange: 'binance',
      };
    } catch (err) {
      console.error(`[Binance] Failed to fetch ticker for ${symbol}:`, err);
      return null;
    }
  }

  /**
   * Fetch candlestick/kline data for backtesting and historical analysis.
   */
  async getKlines(
    symbol: string,
    interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
    limit = 100
  ): Promise<CandlestickData[]> {
    try {
      const response = await this.restClient.get('/api/v3/klines', {
        params: { symbol: symbol.toUpperCase(), interval, limit },
      });
      return response.data.map((k: (string | number)[]) => ({
        openTime: Number(k[0]),
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        closeTime: Number(k[6]),
      }));
    } catch (err) {
      console.error(`[Binance] Failed to fetch klines for ${symbol}:`, err);
      return [];
    }
  }

  /**
   * Generate HMAC-SHA256 signature for authenticated requests.
   */
  signQuery(queryString: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.subscribedSymbols.clear();
    this.tickerCallbacks = [];
    console.log('[Binance WS] Disconnected and cleaned up.');
  }
}

export const binanceService = new BinanceService();

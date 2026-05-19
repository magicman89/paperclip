import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import WebSocket from 'ws';

export interface CoinbaseTickerData {
  symbol: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  exchange: 'coinbase';
}

type TickerCallback = (data: CoinbaseTickerData) => void;

export class CoinbaseService {
  private ws: WebSocket | null = null;
  private restClient: AxiosInstance;
  private subscribedProducts: Set<string> = new Set();
  private tickerCallbacks: TickerCallback[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.restClient = axios.create({
      baseURL: 'https://api.coinbase.com',
      timeout: 10000,
    });
  }

  subscribe(symbols: string[], callback: TickerCallback): void {
    symbols.forEach((s) => this.subscribedProducts.add(s.toUpperCase()));
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

    const productIds = Array.from(this.subscribedProducts).map((s) => `${s}-USD`);

    try {
      this.ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');

      this.ws.on('open', () => {
        console.log('[Coinbase WS] Connected');
        this.reconnectAttempts = 0;

        // Subscribe to ticker channel
        this.ws?.send(JSON.stringify({
          type: 'subscribe',
          product_ids: productIds,
          channels: ['ticker'],
        }));

        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 30000);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'ticker') {
            const tickerData: CoinbaseTickerData = {
              symbol: msg.product_id?.replace('-USD', '') || '',
              price: parseFloat(msg.price || '0'),
              change24h: parseFloat(msg.price_percent_chg_24h || '0'),
              high24h: parseFloat(msg.high_24h || '0'),
              low24h: parseFloat(msg.low_24h || '0'),
              volume24h: parseFloat(msg.volume_24h || '0'),
              exchange: 'coinbase',
            };
            this.tickerCallbacks.forEach((cb) => cb(tickerData));
          }
        } catch (err) {
          console.error('[Coinbase WS] Parse error:', err);
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Coinbase WS] Error:', err.message);
      });

      this.ws.on('close', () => {
        console.log('[Coinbase WS] Disconnected. Attempting reconnect...');
        if (this.pingInterval) clearInterval(this.pingInterval);

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          setTimeout(() => this.reconnect(), delay);
        }
      });
    } catch (err) {
      console.error('[Coinbase WS] Connection error:', err);
    }
  }

  async getTicker(productId: string): Promise<CoinbaseTickerData | null> {
    try {
      const response = await this.restClient.get(`/v2/products/${productId}/ticker`);
      const t = response.data;
      return {
        symbol: productId.toUpperCase(),
        price: parseFloat(t.data?.price || '0'),
        change24h: 0,
        high24h: 0,
        low24h: 0,
        volume24h: parseFloat(t.data?.volume || '0'),
        exchange: 'coinbase',
      };
    } catch (err) {
      console.error(`[Coinbase] Failed to fetch ticker for ${productId}:`, err);
      return null;
    }
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
    this.subscribedProducts.clear();
    this.tickerCallbacks = [];
    console.log('[Coinbase WS] Disconnected and cleaned up.');
  }
}

export const coinbaseService = new CoinbaseService();

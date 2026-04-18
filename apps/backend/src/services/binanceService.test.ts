// Mock WebSocket and axios
jest.mock('ws');
jest.mock('axios');

import { BinanceService } from '../services/binanceService';
import WebSocket from 'ws';
import axios from 'axios';

const mockedWs = WebSocket as jest.MockedClass<typeof WebSocket>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BinanceService', () => {
  let service: BinanceService;

  // Shared mock axios client — configured once per test before service instantiation
  let mockAxiosClient: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Configure axios mock return BEFORE instantiating the service
    // (BinanceService constructor captures axios.create() into this.restClient)
    mockAxiosClient = { get: jest.fn() };
    mockedAxios.create.mockReturnValue(mockAxiosClient as any);

    // Mock WebSocket instance
    const mockWsInstance = {
      on: jest.fn(),
      close: jest.fn(),
      ping: jest.fn(),
      send: jest.fn(),
      readyState: 1, // OPEN
    };
    mockedWs.mockImplementation(() => mockWsInstance as any);

    service = new BinanceService();
  });

  describe('getTicker', () => {
    it('should fetch and parse ticker data correctly', async () => {
      mockAxiosClient.get.mockResolvedValue({
        data: {
          symbol: 'BTCUSDT',
          lastPrice: '67500.00',
          priceChangePercent: '2.35',
          highPrice: '68000.00',
          lowPrice: '66000.00',
          volume: '12345.67',
        },
      });

      const ticker = await service.getTicker('BTCUSDT');

      expect(ticker).not.toBeNull();
      expect(ticker!.symbol).toBe('BTCUSDT');
      expect(ticker!.price).toBe(67500);
      expect(ticker!.change24h).toBe(2.35);
      expect(ticker!.exchange).toBe('binance');
    });

    it('should return null on error', async () => {
      mockAxiosClient.get.mockRejectedValue(new Error('Network error'));

      const ticker = await service.getTicker('INVALID');
      expect(ticker).toBeNull();
    });
  });

  describe('getKlines', () => {
    it('should fetch and parse candlestick data', async () => {
      mockAxiosClient.get.mockResolvedValue({
        data: [
          [1717200000000, '67000', '67500', '66800', '67300', '1234'],
          [1717200060000, '67300', '68000', '67200', '67800', '2345'],
        ],
      });

      const klines = await service.getKlines('BTCUSDT', '1m', 100);

      expect(klines).toHaveLength(2);
      expect(klines[0].open).toBe(67000);
      expect(klines[0].high).toBe(67500);
      expect(klines[0].close).toBe(67300);
    });
  });

  describe('signQuery', () => {
    it('should produce consistent HMAC-SHA256 signatures', () => {
      const sig1 = service.signQuery('symbol=BTCUSDT&timestamp=123456', 'secret123');
      const sig2 = service.signQuery('symbol=BTCUSDT&timestamp=123456', 'secret123');
      const sig3 = service.signQuery('symbol=ETHUSDT&timestamp=123456', 'secret123');

      expect(sig1).toBe(sig2);
      expect(sig1).not.toBe(sig3);
      expect(sig1.length).toBe(64); // hex-encoded SHA256 = 64 chars
    });
  });

  describe('WebSocket subscription', () => {
    it('should attempt to connect with correct stream URL', () => {
      const callback = jest.fn();
      service.subscribe(['BTCUSDT', 'ETHUSDT'], callback);

      expect(mockedWs).toHaveBeenCalled();
      const wsCall = (mockedWs as unknown as jest.Mock).mock.calls[0][0];
      expect(wsCall).toContain('btcusdt@ticker');
      expect(wsCall).toContain('ethusdt@ticker');
      expect(wsCall).toContain('stream.binance.com');
    });
  });
});

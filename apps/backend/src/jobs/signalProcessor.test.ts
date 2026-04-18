import { checkSignalExit, SignalCheck } from './signalProcessor';

describe('checkSignalExit', () => {
  const baseSignal = {
    entry_price: 100,
    target_price: 110,
    stop_loss: 95,
  };

  describe('long signals (buy, long, entry)', () => {
    it('should close when target price is hit', () => {
      const result = checkSignalExit(110, { ...baseSignal, signal_type: 'buy' });
      expect(result.shouldClose).toBe(true);
      expect(result.pnlPercentage).toBeCloseTo(10, 2); // (110-100)/100 * 100 = 10%
    });

    it('should close when stop loss is hit', () => {
      const result = checkSignalExit(94, { ...baseSignal, signal_type: 'buy' });
      expect(result.shouldClose).toBe(true);
      expect(result.pnlPercentage).toBeCloseTo(-6, 2); // (94-100)/100 * 100 = -6%
    });

    it('should NOT close when price is between entry and target', () => {
      const result = checkSignalExit(105, { ...baseSignal, signal_type: 'long' });
      expect(result.shouldClose).toBe(false);
      expect(result.pnlPercentage).toBeNull();
    });

    it('should NOT close when price is above entry but below target', () => {
      const result = checkSignalExit(103, { ...baseSignal, signal_type: 'entry' });
      expect(result.shouldClose).toBe(false);
    });

    it('should handle exact entry price (no change)', () => {
      const result = checkSignalExit(100, { ...baseSignal, signal_type: 'buy' });
      expect(result.shouldClose).toBe(false);
    });

    it('should handle price exactly at stop loss', () => {
      const result = checkSignalExit(95, { ...baseSignal, signal_type: 'buy' });
      // stop_loss condition: currentPrice <= stop_loss (95 <= 95 is true)
      expect(result.shouldClose).toBe(true);
    });
  });

  describe('short signals (sell, short)', () => {
    // For short: entry=100, target (profit) = 90 (price dropped), stop_loss = 110 (price rose)
    const shortSignal = {
      signal_type: 'sell' as const,
      entry_price: 100,
      target_price: 90,
      stop_loss: 110,
    };

    it('should close when target price is hit (price dropped to target)', () => {
      const result = checkSignalExit(90, shortSignal);
      expect(result.shouldClose).toBe(true);
      expect(result.pnlPercentage).toBeCloseTo(10, 2); // (100-90)/100 * 100 = 10%
    });

    it('should close when stop loss is hit (price rose to stop_loss)', () => {
      const result = checkSignalExit(110, shortSignal);
      expect(result.shouldClose).toBe(true);
      expect(result.pnlPercentage).toBeCloseTo(-10, 2); // (100-110)/100 * 100 = -10%
    });

    it('should NOT close when price is between entry and stop_loss (position open)', () => {
      const result = checkSignalExit(105, shortSignal);
      expect(result.shouldClose).toBe(false);
    });

    it('should handle exact entry price (no change, no exit)', () => {
      const result = checkSignalExit(100, shortSignal);
      expect(result.shouldClose).toBe(false);
    });
  });

  describe('null guard conditions', () => {
    it('should NOT close long signal if target_price is null', () => {
      const signal = { signal_type: 'buy', entry_price: 100, target_price: null, stop_loss: 95 } as SignalCheck;
      const result = checkSignalExit(110, signal);
      expect(result.shouldClose).toBe(false); // Can't hit target if null
    });

    it('should close short signal even if stop_loss is null (target hit)', () => {
      const signal = { signal_type: 'sell', entry_price: 100, target_price: 90, stop_loss: null } as SignalCheck;
      // sell with target_price=90: currentPrice=85 <= 90, so target IS hit
      const result = checkSignalExit(85, signal);
      expect(result.shouldClose).toBe(true);
    });
  });
});

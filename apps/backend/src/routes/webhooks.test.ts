import { tierFromPriceId, creditForTier } from './webhooks';

describe('Webhook helpers', () => {
  beforeEach(() => {
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_pro_monthly123';
    process.env.STRIPE_PRO_ANNUAL_PRICE_ID = 'price_pro_annual456';
    process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID = 'price_premium789';
  });

  afterEach(() => {
    delete process.env.STRIPE_PRO_MONTHLY_PRICE_ID;
    delete process.env.STRIPE_PRO_ANNUAL_PRICE_ID;
    delete process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID;
  });

  describe('tierFromPriceId', () => {
    it('maps pro monthly price ID to pro tier', () => {
      expect(tierFromPriceId('price_pro_monthly123')).toBe('pro');
    });

    it('maps pro annual price ID to pro tier', () => {
      expect(tierFromPriceId('price_pro_annual456')).toBe('pro');
    });

    it('maps premium monthly price ID to premium tier', () => {
      expect(tierFromPriceId('price_premium789')).toBe('premium');
    });

    it('returns free for unknown price ID', () => {
      expect(tierFromPriceId('price_unknown')).toBe('free');
    });

    it('returns free for empty string', () => {
      expect(tierFromPriceId('')).toBe('free');
    });
  });

  describe('creditForTier', () => {
    it('returns 3 credits for free tier', () => {
      expect(creditForTier('free')).toBe(3);
    });

    it('returns 50 credits for pro tier', () => {
      expect(creditForTier('pro')).toBe(50);
    });

    it('returns 999999 credits for premium tier', () => {
      expect(creditForTier('premium')).toBe(999999);
    });

    it('returns 3 credits for unknown tier (default)', () => {
      expect(creditForTier('unknown')).toBe(3);
    });
  });
});

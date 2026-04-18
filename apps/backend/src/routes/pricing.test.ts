import { PRICING_TIERS } from '../routes/pricing';

describe('Pricing Routes', () => {
  describe('PRICING_TIERS', () => {
    it('should have three tiers', () => {
      expect(PRICING_TIERS).toHaveLength(3);
    });

    it('should have correct tier IDs', () => {
      expect(PRICING_TIERS.map((t) => t.id)).toEqual(['free', 'pro', 'premium']);
    });

    it('should have increasing prices', () => {
      expect(PRICING_TIERS[0].price).toBe(0);
      expect(PRICING_TIERS[1].price).toBe(49);
      expect(PRICING_TIERS[2].price).toBe(149);
    });

    it('free tier should have limited signals', () => {
      const free = PRICING_TIERS.find((t) => t.id === 'free')!;
      expect(free.limits.signals_per_month).toBe(3);
      expect(free.limits.monitored_traders).toBe(5);
      expect(free.limits.api_requests_per_min).toBe(100);
      expect(free.limits.portfolio_tracking).toBe(false);
    });

    it('pro tier should have unlimited traders and portfolio tracking', () => {
      const pro = PRICING_TIERS.find((t) => t.id === 'pro')!;
      expect(pro.limits.signals_per_month).toBe(50);
      expect(pro.limits.monitored_traders).toBe(-1); // unlimited
      expect(pro.limits.portfolio_tracking).toBe(true);
      expect(pro.limits.api_requests_per_min).toBe(1000);
    });

    it('premium tier should have unlimited everything', () => {
      const premium = PRICING_TIERS.find((t) => t.id === 'premium')!;
      expect(premium.limits.signals_per_month).toBe(-1);
      expect(premium.limits.monitored_traders).toBe(-1);
      expect(premium.limits.api_requests_per_min).toBe(-1);
    });

    it('every tier should have at least one feature', () => {
      PRICING_TIERS.forEach((tier) => {
        expect(tier.features.length).toBeGreaterThan(0);
      });
    });
  });
});

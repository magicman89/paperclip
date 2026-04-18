import { Router, Response, NextFunction } from 'express';
import Stripe from 'stripe';

export const pricingRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

export const PRICING_TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceId: null,
    features: [
      '3 signals per month',
      'Basic trader analytics',
      'Email alerts',
      '5 monitored traders',
    ],
    limits: {
      signals_per_month: 3,
      monitored_traders: 5,
      api_requests_per_min: 100,
      portfolio_tracking: false,
      webhook_alerts: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro',
    features: [
      'Full AI trading agent',
      'Up to 5 trading strategies',
      'Real-time signal alerts',
      'Paper trading mode',
      'Basic analytics dashboard',
      'Email support',
    ],
    limits: {
      signals_per_month: 50,
      monitored_traders: -1,
      api_requests_per_min: 1000,
      portfolio_tracking: true,
      webhook_alerts: true,
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 149,
    priceId: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_premium',
    features: [
      'Everything in Pro',
      'Unlimited trading strategies',
      'API access',
      'Advanced analytics',
      'Priority email support',
      'Webhook alerts',
      'Custom strategy parameters',
    ],
    limits: {
      signals_per_month: -1,
      monitored_traders: -1,
      api_requests_per_min: -1,
      portfolio_tracking: true,
      webhook_alerts: true,
    },
  },
];

// GET /api/v1/pricing
pricingRouter.get('/', async (_req, res: Response, next: NextFunction) => {
  try {
    res.json({
      data: PRICING_TIERS.map((tier) => ({
        id: tier.id,
        name: tier.name,
        price: tier.price,
        priceId: tier.priceId,
        features: tier.features,
        limits: tier.limits,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/pricing/checkout
pricingRouter.post('/checkout', async (req, res: Response, next: NextFunction) => {
  try {
    const { priceId, userId } = req.body;

    if (!priceId || !userId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'priceId and userId are required' },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?subscription=success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?cancelled=true`,
      metadata: { userId },
    });

    res.json({ data: { checkoutUrl: session.url } });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/pricing/portal
pricingRouter.post('/portal', async (req, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'customerId is required' },
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard`,
    });

    res.json({ data: { portalUrl: session.url } });
  } catch (err) {
    next(err);
  }
});

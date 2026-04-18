import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '../utils/supabase';

export const webhookRouter = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const tierFromPriceId = (priceId: string): string => {
  if (priceId === process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID) return 'premium';
  if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID || priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) return 'pro';
  return 'free';
};

export const statusFromStripeSub = (stripeSub: Stripe.Subscription): 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused' => {
  switch (stripeSub.status) {
    case 'active': return 'active';
    case 'trialing': return 'trialing';
    case 'past_due': return 'past_due';
    case 'canceled': return 'cancelled';
    case 'unpaid': return 'past_due';
    default: return 'active';
  }
};

export const creditForTier = (tier: string): number => {
  switch (tier) {
    case 'free': return 3;
    case 'pro': return 50;
    case 'premium': return 999999;
    default: return 3;
  }
};

// Idempotency check: skip already-processed events
async function isEventProcessed(supabase: ReturnType<typeof getSupabaseAdmin>, eventId: string): Promise<boolean> {
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('id', eventId)
    .single();
  return !!data;
}

async function markEventProcessed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
  eventType: string,
  payload: unknown
): Promise<void> {
  await supabase
    .from('webhook_events')
    .insert({ id: eventId, event_type: eventType, payload });
}

async function sendPaymentFailedEmail(email: string, customerName?: string): Promise<void> {
  if (!resend) {
    console.warn('[Webhook] RESEND_API_KEY not set, skipping payment failure email');
    return;
  }
  try {
    await resend.emails.send({
      from: 'Bullspot <noreply@bullspot.app>',
      to: email,
      subject: 'Payment Failed — Action Required',
      html: `
        <p>Hi${customerName ? ` ${customerName}` : ''},</p>
        <p>Your recent payment to Bullspot failed. Your account will remain active for a grace period, but please update your payment method to avoid service interruption.</p>
        <p>Log in to <a href="${process.env.FRONTEND_URL}/dashboard">your dashboard</a> to update your payment method.</p>
        <p>If you have questions, reply to this email.</p>
        <p>— The Bullspot Team</p>
      `,
    });
    console.log(`[Webhook] Payment failure email sent to ${email}`);
  } catch (err) {
    console.error('[Webhook] Failed to send payment failure email:', err);
  }
}

// POST /api/v1/webhooks/stripe
webhookRouter.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const supabase = getSupabaseAdmin();

  try {
    // Idempotency: skip already-processed events
    if (await isEventProcessed(supabase, event.id)) {
      console.log(`[Webhook] Skipping duplicate event: ${event.id}`);
      return res.json({ received: true, skipped: 'already_processed' });
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = tierFromPriceId(priceId);
        const status = statusFromStripeSub(subscription);

        await supabase
          .from('profiles')
          .update({
            subscription_tier: tier,
            subscription_status: status,
            stripe_subscription_id: subscription.id,
            signal_credits: creditForTier(tier),
            last_credit_reset: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);

        console.log(`[Webhook] Subscription ${event.type}: customer=${customerId} tier=${tier} status=${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_status: 'cancelled',
            stripe_subscription_id: null,
            signal_credits: 3,
          })
          .eq('stripe_customer_id', customerId);

        console.log(`[Webhook] Subscription deleted: customer=${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Mark subscription as past_due so the frontend can show the appropriate banner
        await supabase
          .from('profiles')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId);

        // Look up customer email from profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profile?.email) {
          await sendPaymentFailedEmail(profile.email, profile.full_name || undefined);
        } else {
          console.warn(`[Webhook] Payment failed for unknown customer=${customerId}`);
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string;

        if (userId && customerId) {
          await supabase
            .from('profiles')
            .update({ stripe_customer_id: customerId })
            .eq('id', userId);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await markEventProcessed(supabase, event.id, event.type, event.data.object);

    res.json({ received: true });
  } catch (err) {
    console.error('[Webhook] Error processing event:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

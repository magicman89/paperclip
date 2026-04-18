import { getSupabaseAdmin } from '../utils/supabase';

const RESET_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const CREDIT_MAP: Record<string, number> = {
  free: 3,
  pro: 50,
  enterprise: 999999,
};

/**
 * Checks and resets credits for users whose last_credit_reset is > 30 days ago.
 * Runs hourly.
 */
export function startCreditResetter(): void {
  console.log('[CreditResetter] Starting...');

  const reset = async () => {
    try {
      const supabase = getSupabaseAdmin();

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, subscription_tier, last_credit_reset')
        .lt('last_credit_reset', thirtyDaysAgo);

      if (error) {
        console.error('[CreditResetter] Failed to fetch profiles:', error);
        return;
      }

      if (!profiles || profiles.length === 0) return;

      for (const profile of profiles) {
        const newCredits = CREDIT_MAP[profile.subscription_tier] ?? 3;
        await supabase
          .from('profiles')
          .update({
            signal_credits: newCredits,
            last_credit_reset: new Date().toISOString(),
          })
          .eq('id', profile.id);

        console.log(`[CreditResetter] Reset credits for user ${profile.id} (${profile.subscription_tier}): ${newCredits}`);
      }
    } catch (err) {
      console.error('[CreditResetter] Error:', err);
    }
  };

  // Run immediately then hourly
  reset();
  setInterval(reset, RESET_INTERVAL_MS);
  console.log(`[CreditResetter] Running. Checking every ${RESET_INTERVAL_MS / 1000 / 60}min.`);
}

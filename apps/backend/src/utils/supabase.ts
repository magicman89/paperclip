import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient | null = null;
let supabaseUser: SupabaseClient | null = null;

export function initializeSupabase(): void {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !serviceRoleKey || !anonKey) {
    console.warn('[Supabase] Missing environment variables — Supabase client not initialized');
    return;
  }

  // Admin client (bypasses RLS) — only used server-side
  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // User client for authenticated requests
  supabaseUser = createClient(url, anonKey);

  console.log('[Supabase] Initialized');
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not initialized. Call initializeSupabase() first.');
  }
  return supabaseAdmin;
}

export function getSupabaseUser(): SupabaseClient {
  if (!supabaseUser) {
    throw new Error('Supabase user client not initialized. Call initializeSupabase() first.');
  }
  return supabaseUser;
}
